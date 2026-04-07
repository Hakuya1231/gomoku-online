// 五子棋网络模块 - 使用 PeerJS Cloud
class GomokuNetwork {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.roomId = null;
    this.isHost = false;
    this.connected = false;
    this.remotePeerId = null;
    this.myPeerId = null;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;

    // 回调函数
    this.onMove = null;
    this.onUndo = null;
    this.onReset = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.onRoomCreated = null; // 房间创建完成回调

    // UI 元素引用（将在init中设置）
    this.statusEl = null;
    this.roomIdDisplayEl = null;
    this.opponentInfoEl = null;

    // 服务器配置 - 使用 PeerJS 默认服务器，确保所有用户在同一服务器
    // 不指定 host 让 PeerJS 自动选择
    this.peerOptions = {
      debug: 2,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' }
        ]
      }
    };
  }

  // 初始化网络模块
  init(options = {}) {
    const {
      onMove,
      onUndo,
      onReset,
      onConnectionChange,
      onError,
      onRoomCreated,
      statusEl,
      roomIdDisplayEl,
      opponentInfoEl
    } = options;

    this.onMove = onMove;
    this.onUndo = onUndo;
    this.onReset = onReset;
    this.onConnectionChange = onConnectionChange;
    this.onError = onError;
    this.onRoomCreated = onRoomCreated;

    this.statusEl = statusEl;
    this.roomIdDisplayEl = roomIdDisplayEl;
    this.opponentInfoEl = opponentInfoEl;

    // 初始化 PeerJS 对象，使用 PeerJS Cloud
    this.createPeerConnection();

    this.updateStatus('正在初始化网络...');
  }

  // 创建 Peer 连接
  createPeerConnection() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }

    this.updateStatus('正在连接服务器...');

    this.peer = new Peer(this.peerOptions);

    this.setupPeerEvents();
  }

  // 设置 Peer 事件监听
  setupPeerEvents() {
    this.peer.on('open', (id) => {
      console.log('PeerJS 已连接，我的ID:', id);
      this.myPeerId = id;
      this.updateUI();
      this.updateStatus('网络已就绪');
    });

    this.peer.on('connection', (connection) => {
      console.log('收到连接请求:', connection.peer);
      this.handleIncomingConnection(connection);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS 错误:', err);

      // peer-unavailable 只在客机尝试连接时重试
      if (err.type === 'peer-unavailable' && !this.isHost && !this.connected) {
        this.handleConnectionError(err);
      } else if (err.type === 'disconnected' || err.type === 'network') {
        this.updateStatus('网络断开，正在重连...');
        setTimeout(() => {
          if (this.peer && !this.peer.destroyed) {
            this.peer.reconnect();
          }
        }, 1000);
      } else {
        this.updateStatus('连接错误: ' + err.type);
        if (this.onError) this.onError(err);
      }
    });

    this.peer.on('disconnected', () => {
      console.log('PeerJS 断开连接');
      this.updateStatus('已断开连接，尝试重连...');
      setTimeout(() => {
        if (!this.peer.destroyed) {
          this.peer.reconnect();
        }
      }, 1000);
    });
  }

  // 创建房间（作为主机）
  createRoom() {
    // 如果还没有Peer ID，等待初始化完成
    if (!this.peer || !this.myPeerId) {
      this.updateStatus('等待网络初始化...');
      // 返回一个Promise风格的回调
      const checkReady = () => {
        if (this.myPeerId) {
          this.doCreateRoom();
        } else {
          setTimeout(checkReady, 200);
        }
      };
      checkReady();
      return null; // 立即返回null，稍后通过回调通知
    }

    return this.doCreateRoom();
  }

  // 实际执行创建房间
  doCreateRoom() {
    // 使用完整Peer ID作为房间标识
    this.roomId = this.myPeerId;
    this.isHost = true;
    this.remotePeerId = null;
    this.updateUI();
    this.updateStatus('房间已创建，等待对手加入...');

    // 显示房间ID供对方加入（显示简短版本便于识别）
    if (this.roomIdDisplayEl) {
      this.roomIdDisplayEl.textContent = this.myPeerId.substring(0, 6).toUpperCase();
    }

    // 触发回调，传入完整Peer ID用于生成链接
    if (this.onRoomCreated) {
      this.onRoomCreated(this.myPeerId);
    }

    return this.roomId;
  }

  // 加入房间（作为客户端）
  joinRoom(roomId) {
    if (!this.myPeerId) {
      this.updateStatus('等待网络初始化...');
      setTimeout(() => this.joinRoom(roomId), 500);
      return;
    }

    if (!roomId || roomId.trim() === '') {
      if (this.onError) this.onError('请输入房间号');
      return;
    }

    this.roomId = roomId.trim();
    this.isHost = false;
    this.remotePeerId = roomId;
    this.updateUI();

    this.attemptConnection();
  }

  // 尝试连接（带重试）
  attemptConnection() {
    this.updateStatus('正在连接房间...');
    this.connectionAttempts = (this.connectionAttempts || 0) + 1;
    this.maxConnectionAttempts = 5;

    // 清理之前的连接
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }

    try {
      this.conn = this.peer.connect(this.remotePeerId, {
        reliable: true,
        serialization: 'json'
      });

      this.setupConnection(this.conn);
    } catch (err) {
      console.error('连接失败:', err);
      this.handleConnectionError(err);
    }
  }

  // 处理连接错误（带重试）
  handleConnectionError(err) {
    const errType = err.type || 'unknown';
    if (errType === 'peer-unavailable' && this.connectionAttempts < this.maxConnectionAttempts) {
      this.updateStatus(`连接失败，正在重试 (${this.connectionAttempts}/${this.maxConnectionAttempts})...`);
      setTimeout(() => this.attemptConnection(), 1500);
    } else {
      this.updateStatus('无法连接，请确认对方已创建房间');
      if (this.onError) this.onError(err);
    }
  }

  // 处理传入的连接
  handleIncomingConnection(connection) {
    if (this.conn) {
      console.log('已有连接，拒绝新的连接');
      connection.close();
      return;
    }

    this.conn = connection;
    this.remotePeerId = connection.peer;

    this.updateStatus('对手正在连接...');

    // 设置连接事件处理
    this.setupConnection(connection);

    // 对于传入连接，可能已经 open，需要检查状态
    if (connection.open) {
      console.log('传入连接已建立');
      this.onConnectionOpen();
    }
  }

  // 连接打开时的处理
  onConnectionOpen() {
    this.connected = true;
    this.connectionAttempts = 0; // 重置重试计数
    this.updateStatus('已连接');
    this.updateUI();

    if (this.opponentInfoEl) {
      this.opponentInfoEl.textContent = '已连接';
    }

    if (this.onConnectionChange) {
      this.onConnectionChange(true);
    }

    // 发送问候
    this.send({ type: 'hello', playerId: this.myPeerId });
  }

  // 设置连接事件处理
  setupConnection(connection) {
    connection.on('open', () => {
      console.log('连接已建立');
      this.onConnectionOpen();
    });

    connection.on('data', (data) => {
      console.log('收到数据:', data);
      this.handleMessage(data);
    });

    connection.on('close', () => {
      console.log('连接已关闭');
      this.connected = false;
      this.conn = null;
      this.updateStatus('连接已断开');
      this.updateUI();

      if (this.onConnectionChange) {
        this.onConnectionChange(false);
      }
    });

    connection.on('error', (err) => {
      console.error('连接错误:', err);
      // 连接错误时可能需要重试
      if (!this.connected && this.isHost === false) {
        this.handleConnectionError(err);
      } else {
        this.updateStatus('连接错误');
        if (this.onError) this.onError(err);
      }
    });
  }

  // 处理收到的消息
  handleMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'hello':
        console.log('收到对方问候:', data.playerId);
        if (this.opponentInfoEl) {
          this.opponentInfoEl.textContent = '已连接';
        }
        break;

      case 'move':
        if (this.onMove) {
          this.onMove(data.r, data.c, data.playerSide);
        }
        break;

      case 'undo':
        if (this.onUndo) {
          this.onUndo();
        }
        break;

      case 'reset':
        if (this.onReset) {
          this.onReset(data.size, data.first);
        }
        break;

      case 'chat':
        // 可选：聊天功能
        console.log('聊天:', data.message);
        break;

      default:
        console.log('未知消息类型:', data.type);
    }
  }

  // 发送消息
  send(data) {
    if (!this.conn || !this.connected) {
      console.warn('未连接，无法发送消息');
      return false;
    }

    try {
      this.conn.send(data);
      return true;
    } catch (err) {
      console.error('发送失败:', err);
      return false;
    }
  }

  // 发送落子
  sendMove(r, c, playerSide) {
    return this.send({
      type: 'move',
      r,
      c,
      playerSide,
      timestamp: Date.now()
    });
  }

  // 发送悔棋
  sendUndo() {
    return this.send({
      type: 'undo',
      timestamp: Date.now()
    });
  }

  // 发送重开
  sendReset(size, first) {
    return this.send({
      type: 'reset',
      size,
      first,
      timestamp: Date.now()
    });
  }

  // 断开连接
  disconnect() {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }

    this.connected = false;
    this.remotePeerId = null;
    this.updateUI();
    this.updateStatus('已断开连接');

    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }
  }

  // 更新UI状态
  updateUI() {
    if (this.statusEl) {
      const status = this.connected ? '已连接' : '未连接';
      this.statusEl.textContent = status;
    }

    if (this.roomIdDisplayEl) {
      // 显示简短版本便于识别
      const displayId = this.roomId ? this.roomId.substring(0, 6).toUpperCase() : '-';
      this.roomIdDisplayEl.textContent = displayId;
    }

    if (this.opponentInfoEl) {
      if (this.connected) {
        this.opponentInfoEl.textContent = '已连接';
      } else if (this.remotePeerId) {
        this.opponentInfoEl.textContent = '连接中...';
      } else {
        this.opponentInfoEl.textContent = '-';
      }
    }
  }

  // 更新状态文本
  updateStatus(text) {
    console.log('状态:', text);
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  // 生成易读的房间ID（取Peer ID前6位）
  generateRoomId() {
    if (!this.myPeerId) return '------';
    return this.myPeerId.substring(0, 6).toUpperCase();
  }

  // 获取连接状态
  isConnected() {
    return this.connected;
  }

  // 获取是否为主机（属性直接访问）
  // 获取房间ID
  getRoomId() {
    return this.roomId;
  }
}

// 创建全局网络实例
window.gomokuNetwork = new GomokuNetwork();