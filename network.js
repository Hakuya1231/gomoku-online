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

    // 回调函数
    this.onMove = null;
    this.onUndo = null;
    this.onReset = null;
    this.onConnectionChange = null;
    this.onError = null;
    this.onRoomCreated = null;

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
  }

  // 加入房间（作为客机）
  joinRoom(roomId) {
    if (!this.database) {
      this.updateStatus('网络未就绪');
      return;
    }

    if (!roomId || roomId.trim() === '') {
      if (this.onError) this.onError('请输入房间号');
      return;
    }

    this.roomId = roomId.trim().toUpperCase();
    this.isHost = false;
    this.roomRef = this.database.ref('rooms/' + this.roomId);

    this.updateStatus('正在连接房间...');

    // 检查房间是否存在
    this.roomRef.once('value').then((snapshot) => {
      const roomData = snapshot.val();
      if (!roomData || !roomData.host) {
        this.updateStatus('房间不存在');
        if (this.onError) this.onError('房间不存在');
        return;
      }

      // 写入客机信息
      return this.roomRef.child('guest').set({
        id: this.myId,
        timestamp: firebase.database.ServerValue.TIMESTAMP
      });
    }).then(() => {
      console.log('已加入房间:', this.roomId);
      this.connected = true;
      this.updateStatus('已连接');
      this.updateUI();

      if (this.opponentInfoEl) {
        this.opponentInfoEl.textContent = '已连接';
      }

      if (this.onConnectionChange) {
        this.onConnectionChange(true);
      }

      // 开始监听主机消息
      this.listenForMessages('host');
    }).catch(err => {
      console.error('加入房间失败:', err);
      this.updateStatus('连接失败');
      if (this.onError) this.onError(err);
    });
  }

  // 监听消息
  listenForMessages(fromRole) {
    const messagesRef = this.roomRef.child('messages/' + fromRole);
    this.messageListener = messagesRef.on('child_added', (snapshot) => {
      const message = snapshot.val();
      if (message) {
        console.log('收到消息:', message);
        this.handleMessage(message);
      }
    });
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

  // 断开连接
  disconnect() {
    if (this.messageListener) {
      this.roomRef.off('child_added', this.messageListener);
      this.messageListener = null;
    }

    if (this.roomRef) {
      if (this.isHost) {
        // 主机删除整个房间
        this.roomRef.remove();
      } else {
        // 客机删除自己的信息
        this.roomRef.child('guest').remove();
      }
    }

    this.connected = false;
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