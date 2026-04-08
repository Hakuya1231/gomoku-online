// 五子棋网络模块 - 使用 Firebase Realtime Database
class GomokuNetwork {
  constructor() {
    this.database = null;
    this.roomId = null;
    this.isHost = false;
    this.connected = false;
    this.myId = null;
    this.roomRef = null;
    this.messageListener = null;
    this.role = null; // 'host' | 'guest' | 'spectator'

    // 回调函数
    this.onMove = null;
    this.onUndo = null;
    this.onReset = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.onRoomCreated = null;
    this.onBoardState = null;
    this.onBoardStateRequest = null;
    this.onGameConfig = null; // 新增：游戏配置同步回调

    // UI 元素引用
    this.statusEl = null;
    this.roomIdDisplayEl = null;
    this.opponentInfoEl = null;

    // Firebase 配置
    this.firebaseConfig = {
      apiKey: "AIzaSyBElQCxrD1eL0vDoHhmsgsUc9-xS7hmfQI",
      authDomain: "gomoku-online-d8e8b.firebaseapp.com",
      projectId: "gomoku-online-d8e8b",
      storageBucket: "gomoku-online-d8e8b.firebasestorage.app",
      messagingSenderId: "182171533175",
      appId: "1:182171533175:web:d1222057e09a876954eb72",
      databaseURL: "https://gomoku-online-d8e8b-default-rtdb.firebaseio.com"
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
      onBoardState,
      onBoardStateRequest,
      onGameConfig,
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
    this.onBoardState = onBoardState;
    this.onBoardStateRequest = onBoardStateRequest;
    this.onGameConfig = onGameConfig;

    this.statusEl = statusEl;
    this.roomIdDisplayEl = roomIdDisplayEl;
    this.opponentInfoEl = opponentInfoEl;

    // 初始化 Firebase
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(this.firebaseConfig);
      }
      this.database = firebase.database();
      this.myId = this.generateId();
      console.log('Firebase 已初始化，我的ID:', this.myId);
      this.updateStatus('网络已就绪');
      this.updateUI();
    } catch (err) {
      console.error('Firebase 初始化失败:', err);
      this.updateStatus('网络初始化失败');
      if (this.onError) this.onError(err);
    }
  }

  // 生成随机ID
  generateId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // 生成房间号
  generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // 创建房间（作为主机）
  createRoom() {
    if (!this.database) {
      this.updateStatus('网络未就绪');
      return null;
    }

    this.roomId = this.generateRoomId();
    this.isHost = true;
    this.roomRef = this.database.ref('rooms/' + this.roomId);

    // 写入主机信息
    this.roomRef.set({
      host: {
        id: this.myId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      },
      guest: null,
      messages: {}
    }).then(() => {
      console.log('房间已创建:', this.roomId);
      this.role = 'host';
      this.updateStatus('房间已创建，等待对手加入...');
      this.updateUI();

      if (this.roomIdDisplayEl) {
        this.roomIdDisplayEl.textContent = this.roomId;
      }

      // 监听客机加入
      this.listenForGuest();

      if (this.onRoomCreated) {
        this.onRoomCreated(this.roomId);
      }
    }).catch(err => {
      console.error('创建房间失败:', err);
      this.updateStatus('创建房间失败');
      if (this.onError) this.onError(err);
    });

    return this.roomId;
  }

  // 监听客机加入
  listenForGuest() {
    const guestRef = this.roomRef.child('guest');
    guestRef.on('value', (snapshot) => {
      const guestData = snapshot.val();
      if (guestData && !this.connected) {
        console.log('客机已加入:', guestData);
        this.connected = true;
        this.updateStatus('已连接');
        this.updateUI();

        if (this.opponentInfoEl) {
          this.opponentInfoEl.textContent = '已连接';
        }

        if (this.onConnectionChange) {
          this.onConnectionChange(true);
        }

        // 开始监听客机消息
        this.listenForMessages('guest');
      }
    });

    // 监听观战者消息（用于响应状态请求）
    this.listenForMessages('spectator');
  }

  // 加入房间（作为客机或观战者）
  joinRoom(roomId) {
    if (!this.database) {
      this.updateStatus('网络未就绪');
      return;
    }

    if (!roomId || roomId.trim() === '') {
      if (this.onError) this.onError('请输入房间号');
      return;
    }

    // 清理房间号，只保留字母数字
    let cleanRoomId = roomId.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanRoomId.length < 4) {
      if (this.onError) this.onError('房间号格式无效');
      return;
    }

    this.roomId = cleanRoomId;
    this.isHost = false;
    this.roomRef = this.database.ref('rooms/' + this.roomId);

    this.updateStatus('正在连接房间...');

    // 检查房间是否存在及状态
    this.roomRef.once('value').then((snapshot) => {
      const roomData = snapshot.val();
      if (!roomData || !roomData.host) {
        this.updateStatus('房间不存在');
        if (this.onError) this.onError('房间不存在');
        return;
      }

      // 检查是否已有客机
      if (roomData.guest) {
        // 房间已满，加入为观战者
        return this.joinAsSpectator();
      } else {
        // 作为客机加入
        return this.joinAsGuest();
      }
    }).catch(err => {
      console.error('加入房间失败:', err);
      this.updateStatus('连接失败');
      if (this.onError) this.onError(err);
    });
  }

  // 作为客机加入
  joinAsGuest() {
    return this.roomRef.child('guest').set({
      id: this.myId,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
      console.log('已作为客机加入房间:', this.roomId);
      this.role = 'guest';
      this.connected = true;
      this.updateStatus('已连接');
      this.updateUI();

      if (this.opponentInfoEl) {
        this.opponentInfoEl.textContent = '已连接';
      }

      if (this.onConnectionChange) {
        this.onConnectionChange(true);
      }

      // 监听主机消息
      this.listenForMessages('host');
    });
  }

  // 作为观战者加入
  joinAsSpectator() {
    const spectatorRef = this.roomRef.child('spectators').push();
    return spectatorRef.set({
      id: this.myId,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).then(() => {
      console.log('已作为观战者加入房间:', this.roomId);
      this.role = 'spectator';
      this.connected = true;
      this.updateStatus('观战模式');
      this.updateUI();

      if (this.opponentInfoEl) {
        this.opponentInfoEl.textContent = '观战中';
      }

      if (this.onConnectionChange) {
        this.onConnectionChange(true);
      }

      // 监听三方消息（主机、客机、自己的状态同步）
      this.listenForMessages('host');
      this.listenForMessages('guest');
      this.listenForMessages('spectator');

      // 请求当前棋盘状态
      this.requestBoardState();
    });
  }

  // 请求棋盘状态
  requestBoardState() {
    const myRole = 'spectator';
    const messagesRef = this.roomRef.child('messages/' + myRole);

    messagesRef.push({
      type: 'request_state',
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });
  }

  // 监听消息
  listenForMessages(fromRole) {
    const messagesRef = this.roomRef.child('messages/' + fromRole);
    const listener = messagesRef.on('child_added', (snapshot) => {
      const message = snapshot.val();
      if (message) {
        console.log('收到消息:', message);
        this.handleMessage(message);
      }
    });

    // 保存监听器引用以便清理
    if (!this.messageListeners) {
      this.messageListeners = [];
    }
    this.messageListeners.push({ ref: messagesRef, listener });
  }

  // 处理收到的消息
  handleMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case 'hello':
        console.log('收到对方问候:', data.playerId);
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

      case 'request_state':
        // 观战者请求棋盘状态
        if (this.onBoardStateRequest) {
          this.onBoardStateRequest();
        }
        break;

      case 'board_state':
        // 收到棋盘状态同步
        console.log('handleMessage board_state:', data);
        if (this.onBoardState) {
          this.onBoardState(data.board, data.moves, data.turn, data.winner, data.winningLine);
        } else {
          console.warn('onBoardState 回调未设置');
        }
        break;

      case 'game_config':
        // 收到游戏配置（棋盘大小等）
        console.log('收到游戏配置:', data);
        if (this.onGameConfig) {
          this.onGameConfig(data.size, data.first, data.forbidden);
        }
        break;

      default:
        console.log('未知消息类型:', data.type);
    }
  }

  // 发送消息
  send(data) {
    if (!this.roomRef || !this.connected) {
      console.warn('未连接，无法发送消息');
      return false;
    }

    // 发送到自己的消息队列，对方监听这个队列
    const myRole = this.isHost ? 'host' : 'guest';
    const messagesRef = this.roomRef.child('messages/' + myRole);

    messagesRef.push({
      ...data,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => {
      console.error('发送失败:', err);
    });

    return true;
  }

  // 发送落子
  sendMove(r, c, playerSide) {
    return this.send({
      type: 'move',
      r,
      c,
      playerSide
    });
  }

  // 发送悔棋
  sendUndo() {
    return this.send({
      type: 'undo'
    });
  }

  // 发送重开
  sendReset(size, first) {
    return this.send({
      type: 'reset',
      size,
      first
    });
  }

  // 发送棋盘状态（给观战者）
  sendBoardState(board, moves, turn, winner, winningLine) {
    // 发送到 spectator 消息队列
    const messagesRef = this.roomRef.child('messages/spectator');

    messagesRef.push({
      type: 'board_state',
      board,
      moves,
      turn,
      winner,
      winningLine,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => {
      console.error('发送棋盘状态失败:', err);
    });
  }

  // 发送游戏配置（给客机）
  sendGameConfig(size, first, forbidden) {
    const messagesRef = this.roomRef.child('messages/host');

    messagesRef.push({
      type: 'game_config',
      size,
      first,
      forbidden,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => {
      console.error('发送游戏配置失败:', err);
    });
  }

  // 断开连接
  disconnect() {
    // 清理所有消息监听器
    if (this.messageListeners) {
      this.messageListeners.forEach(({ ref, listener }) => {
        ref.off('child_added', listener);
      });
      this.messageListeners = [];
    }

    if (this.roomRef) {
      if (this.isHost) {
        // 主机删除整个房间
        this.roomRef.remove();
      } else if (this.role === 'spectator') {
        // 观战者删除自己的信息
        // 暂时不实现，观战者直接离开不影响房间
      } else {
        // 客机删除自己的信息
        this.roomRef.child('guest').remove();
      }
    }

    this.connected = false;
    this.role = null;
    this.roomId = null;
    this.roomRef = null;
    this.updateUI();
    this.updateStatus('已断开连接');

    if (this.onConnectionChange) {
      this.onConnectionChange(false);
    }
  }

  // 更新UI状态
  updateUI() {
    if (this.roomIdDisplayEl) {
      this.roomIdDisplayEl.textContent = this.roomId || '-';
    }

    if (this.opponentInfoEl) {
      if (this.connected) {
        this.opponentInfoEl.textContent = '已连接';
      } else if (this.roomId) {
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

  // 获取连接状态
  isConnected() {
    return this.connected;
  }

  // 获取房间ID
  getRoomId() {
    return this.roomId;
  }
}

// 创建全局网络实例
window.gomokuNetwork = new GomokuNetwork();