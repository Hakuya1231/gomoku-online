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

    // 回调函数
    this.onMove = null;
    this.onUndo = null;
    this.onReset = null;
    this.onConnectionChange = null;
    this.onError = null;

    // UI 元素引用（将在init中设置）
    this.statusEl = null;
    this.roomIdDisplayEl = null;
    this.opponentInfoEl = null;
  }

  // 初始化网络模块
  init(options = {}) {
    const {
      onMove,
      onUndo,
      onReset,
      onConnectionChange,
      onError,
      statusEl,
      roomIdDisplayEl,
      opponentInfoEl
    } = options;

    this.onMove = onMove;
    this.onUndo = onUndo;
    this.onReset = onReset;
    this.onConnectionChange = onConnectionChange;
    this.onError = onError;

    this.statusEl = statusEl;
    this.roomIdDisplayEl = roomIdDisplayEl;
    this.opponentInfoEl = opponentInfoEl;

    // 初始化 PeerJS 对象，使用 PeerJS Cloud
    this.peer = new Peer({
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      debug: 3 // 调试信息
    });

    this.peer.on('open', (id) => {
      console.log('PeerJS 已连接，我的ID:', id);
      this.myPeerId = id;
      this.updateUI();
    });

    this.peer.on('connection', (connection) => {
      console.log('收到连接请求:', connection.peer);
      this.handleIncomingConnection(connection);
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS 错误:', err);
      if (this.onError) this.onError(err);
      this.updateStatus('连接错误: ' + err.type);
    });

    this.peer.on('disconnected', () => {
      console.log('PeerJS 断开连接');
      this.updateStatus('已断开连接，尝试重连...');
      this.peer.reconnect();
    });

    this.updateStatus('正在初始化网络...');
  }

  // 创建房间（作为主机）
  createRoom() {
    if (!this.peer || !this.peer.id) {
      this.updateStatus('等待 PeerJS 初始化...');
      setTimeout(() => this.createRoom(), 500);
      return;
    }

    this.roomId = this.generateRoomId();
    this.isHost = true;
    this.remotePeerId = null;
    this.updateUI();
    this.updateStatus('房间已创建，等待对手加入...');

    // 显示房间ID供对方加入
    if (this.roomIdDisplayEl) {
      this.roomIdDisplayEl.textContent = this.roomId;
    }

    return this.roomId;
  }

  // 加入房间（作为客户端）
  joinRoom(roomId) {
    if (!this.peer || !this.peer.id) {
      this.updateStatus('等待 PeerJS 初始化...');
      setTimeout(() => this.joinRoom(roomId), 500);
      return;
    }

    if (!roomId || roomId.trim() === '') {
      if (this.onError) this.onError('请输入房间号');
      return;
    }

    this.roomId = roomId.trim();
    this.isHost = false;
    this.remotePeerId = roomId; // 房间号就是主机的Peer ID
    this.updateUI();

    this.updateStatus('正在连接房间...');

    // 尝试连接到主机
    try {
      this.conn = this.peer.connect(this.remotePeerId, {
        reliable: true,
        serialization: 'json'
      });

      this.setupConnection(this.conn);
    } catch (err) {
      console.error('连接失败:', err);
      this.updateStatus('连接失败: ' + err.message);
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
    this.setupConnection(connection);

    this.updateStatus('对手已加入');
    if (this.opponentInfoEl) {
      this.opponentInfoEl.textContent = '已连接';
    }
  }

  // 设置连接事件处理
  setupConnection(connection) {
    connection.on('open', () => {
      console.log('连接已建立');
      this.connected = true;
      this.updateStatus('已连接');
      this.updateUI();

      if (this.onConnectionChange) {
        this.onConnectionChange(true);
      }

      // 发送我方信息
      this.send({ type: 'hello', playerId: this.myPeerId });
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
      this.updateStatus('连接错误');
      if (this.onError) this.onError(err);
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
      this.roomIdDisplayEl.textContent = this.roomId || '-';
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