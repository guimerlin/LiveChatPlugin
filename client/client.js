/**
 * Jellyfin SyncPlay Chat — Client Overlay
 * Connects to a standalone Node.js Docker chat server.
 */
(function () {
    'use strict';

    // ─── Configuration ────────────────────────────────────────────────────────
    const CONFIG = {
        // Change this to your Node.js Chat Server IP/Port
        SERVER_URL: 'http://localhost:3000',
        PANEL_ID: 'syncplay-chat-panel',
        SCRIPT_TAG: 'syncplaychat-styles'
    };

    // ─── State ────────────────────────────────────────────────────────────────
    let currentGroupId = null;
    let panelVisible = true;
    let socket = null;
    let isConnected = false;

    // ─── Styles ───────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(CONFIG.SCRIPT_TAG)) return;
        const style = document.createElement('style');
        style.id = CONFIG.SCRIPT_TAG;
        style.textContent = `
            /* ── Container ── */
            #${CONFIG.PANEL_ID} {
                position: fixed;
                top: 0;
                right: 0;
                width: 320px;
                height: 100vh;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                background: rgba(10, 10, 18, 0.82);
                backdrop-filter: blur(18px) saturate(1.6);
                -webkit-backdrop-filter: blur(18px) saturate(1.6);
                border-left: 1px solid rgba(255,255,255,0.08);
                box-shadow: -4px 0 32px rgba(0,0,0,0.55);
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                transition: transform 0.3s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease;
                transform: translateX(0);
                color: #e8e8f0;
            }

            #${CONFIG.PANEL_ID}.hidden {
                transform: translateX(100%);
                opacity: 0;
                pointer-events: none;
            }

            /* ── Toggle button (always visible) ── */
            #spc-toggle-btn {
                position: fixed;
                top: 50%;
                right: 0;
                transform: translateY(-50%);
                z-index: 10001;
                width: 28px;
                height: 60px;
                background: rgba(20, 20, 36, 0.9);
                border: 1px solid rgba(255,255,255,0.12);
                border-right: none;
                border-radius: 8px 0 0 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, right 0.3s cubic-bezier(0.4,0,0.2,1);
                backdrop-filter: blur(10px);
                color: #a0a0c0;
                font-size: 14px;
                padding: 0;
                outline: none;
                box-shadow: -2px 0 12px rgba(0,0,0,0.4);
            }

            #spc-toggle-btn:hover { background: rgba(80, 60, 160, 0.7); color: #fff; }
            #spc-toggle-btn.panel-hidden { right: 0; }
            #spc-toggle-btn:not(.panel-hidden) { right: 320px; }

            /* ── Header ── */
            #spc-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px 12px;
                border-bottom: 1px solid rgba(255,255,255,0.07);
                flex-shrink: 0;
                background: rgba(30, 20, 60, 0.5);
            }

            #spc-title {
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.3px;
                color: #c8b8ff;
                display: flex;
                align-items: center;
                gap: 7px;
            }

            #spc-group-badge {
                font-size: 10px;
                background: rgba(120, 80, 220, 0.25);
                border: 1px solid rgba(120, 80, 220, 0.4);
                border-radius: 20px;
                padding: 2px 8px;
                color: #b090ff;
                max-width: 140px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            #spc-status-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #f87171;
                box-shadow: 0 0 6px #f87171;
                flex-shrink: 0;
                transition: background 0.3s, box-shadow 0.3s;
            }

            /* ── Messages area ── */
            #spc-messages {
                flex: 1;
                overflow-y: auto;
                padding: 12px 10px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                scrollbar-width: thin;
                scrollbar-color: rgba(120,80,220,0.3) transparent;
            }

            #spc-messages::-webkit-scrollbar { width: 4px; }
            #spc-messages::-webkit-scrollbar-thumb {
                background: rgba(120,80,220,0.35);
                border-radius: 2px;
            }

            /* ── Message bubble ── */
            .spc-msg {
                display: flex;
                align-items: flex-start;
                gap: 8px;
                animation: spc-slide-in 0.22s ease-out;
                padding: 4px 2px;
            }

            @keyframes spc-slide-in {
                from { opacity: 0; transform: translateY(6px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            .spc-avatar {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: linear-gradient(135deg, #7c3aed, #4f46e5);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 700;
                color: #fff;
                flex-shrink: 0;
                margin-top: 2px;
                text-transform: uppercase;
            }

            .spc-bubble { flex: 1; min-width: 0; }
            .spc-name-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
            .spc-username { font-size: 11.5px; font-weight: 600; color: #c8b8ff; }
            .spc-time { font-size: 10px; color: rgba(255,255,255,0.3); }
            .spc-content { font-size: 13px; line-height: 1.45; color: rgba(255,255,255,0.85); word-break: break-word; white-space: pre-wrap; }

            .spc-msg.own .spc-username { color: #86efac; }
            .spc-msg.own .spc-avatar { background: linear-gradient(135deg, #16a34a, #059669); }

            /* ── System message ── */
            .spc-system {
                text-align: center;
                font-size: 11px;
                color: rgba(255,255,255,0.3);
                padding: 4px 0;
                font-style: italic;
            }

            /* ── Input area ── */
            #spc-input-area {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-top: 1px solid rgba(255,255,255,0.07);
                flex-shrink: 0;
                background: rgba(15, 10, 30, 0.5);
            }

            #spc-input {
                flex: 1;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 20px;
                padding: 8px 14px;
                font-size: 13px;
                color: #e8e8f0;
                outline: none;
                font-family: inherit;
                transition: border-color 0.2s, background 0.2s;
                resize: none;
                max-height: 80px;
                line-height: 1.4;
            }

            #spc-input::placeholder { color: rgba(255,255,255,0.25); }
            #spc-input:focus {
                border-color: rgba(120,80,220,0.6);
                background: rgba(255,255,255,0.09);
            }

            #spc-send-btn {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: linear-gradient(135deg, #7c3aed, #4f46e5);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: transform 0.15s, opacity 0.15s, box-shadow 0.2s;
                box-shadow: 0 2px 10px rgba(100,60,200,0.4);
            }

            #spc-send-btn:hover { transform: scale(1.1); box-shadow: 0 4px 16px rgba(100,60,200,0.6); }
            #spc-send-btn:active { transform: scale(0.95); }
            #spc-send-btn svg { pointer-events: none; }

            /* ── Waiting state ── */
            #spc-waiting {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                color: rgba(255,255,255,0.35);
                font-size: 13px;
                text-align: center;
                padding: 24px;
            }

            #spc-waiting svg { opacity: 0.4; }

            .spc-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid rgba(120,80,220,0.2);
                border-top-color: rgba(120,80,220,0.8);
                border-radius: 50%;
                animation: spc-spin 0.9s linear infinite;
            }

            @keyframes spc-spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    // ─── Build Panel DOM ──────────────────────────────────────────────────────
    function buildPanel() {
        if (document.getElementById(CONFIG.PANEL_ID)) return;

        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'spc-toggle-btn';
        toggleBtn.setAttribute('aria-label', 'Toggle SyncPlay Chat');
        toggleBtn.innerHTML = arrowSvg('right');
        toggleBtn.addEventListener('click', togglePanel);

        const panel = document.createElement('div');
        panel.id = CONFIG.PANEL_ID;
        panel.setAttribute('role', 'complementary');

        panel.innerHTML = `
            <div id="spc-header">
                <div id="spc-title">
                    ${chatIconSvg()}
                    <span>SyncPlay Chat</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span id="spc-status-dot"></span>
                    <span id="spc-group-badge">Not in group</span>
                </div>
            </div>
            <div id="spc-waiting">
                <div class="spc-spinner"></div>
                <span>Waiting for a SyncPlay session…</span>
            </div>
            <div id="spc-messages" style="display:none;" aria-live="polite"></div>
            <div id="spc-input-area" style="display:none;">
                <textarea id="spc-input" rows="1" maxlength="500" placeholder="Send a message…"></textarea>
                <button id="spc-send-btn">${sendSvg()}</button>
            </div>
        `;

        document.body.appendChild(toggleBtn);
        document.body.appendChild(panel);

        document.getElementById('spc-send-btn').addEventListener('click', handleSend);
        document.getElementById('spc-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        document.getElementById('spc-input').addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 80) + 'px';
        });

        // Hide toggle by default until SyncPlay is detected (optional, but requested by user to only show if in syncplay)
        toggleBtn.style.display = 'none';
        panel.style.display = 'none';
        panelVisible = false;
    }

    function togglePanel() {
        panelVisible = !panelVisible;
        const panel = document.getElementById(CONFIG.PANEL_ID);
        const btn = document.getElementById('spc-toggle-btn');
        if (!panel || !btn) return;

        if (panelVisible) {
            panel.classList.remove('hidden');
            btn.classList.remove('panel-hidden');
            btn.innerHTML = arrowSvg('right');
        } else {
            panel.classList.add('hidden');
            btn.classList.add('panel-hidden');
            btn.innerHTML = arrowSvg('left');
        }
    }

    function setPanelVisibility(show) {
        const panel = document.getElementById(CONFIG.PANEL_ID);
        const btn = document.getElementById('spc-toggle-btn');
        if (!panel || !btn) return;

        if (show) {
            panel.style.display = 'flex';
            btn.style.display = 'flex';
            if (!panelVisible) togglePanel(); // open it by default when joining
        } else {
            panel.style.display = 'none';
            btn.style.display = 'none';
            if (panelVisible) togglePanel(); // close it
        }
    }

    // ─── Socket.IO Integration ────────────────────────────────────────────────
    async function loadSocketIo() {
        if (window.io) return window.io;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
            script.onload = () => resolve(window.io);
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    async function connectToChatServer() {
        if (socket) return;
        
        try {
            const io = await loadSocketIo();
            socket = io(CONFIG.SERVER_URL);

            socket.on('connect', () => {
                isConnected = true;
                updateStatusDot();
                if (currentGroupId) {
                    joinChatRoom(currentGroupId);
                }
            });

            socket.on('disconnect', () => {
                isConnected = false;
                updateStatusDot();
            });

            socket.on('chatHistory', (messages) => {
                const container = document.getElementById('spc-messages');
                if (container) container.innerHTML = '';
                messages.forEach(appendMessageToDOM);
                scrollToBottom();
            });

            socket.on('newMessage', (msg) => {
                appendMessageToDOM(msg);
                scrollToBottom();
            });
        } catch (err) {
            console.error('[SyncPlayChat] Failed to load or connect Socket.IO', err);
        }
    }

    function joinChatRoom(groupId) {
        if (!socket || !isConnected) return;
        socket.emit('joinRoom', {
            groupId: groupId,
            username: getCurrentUsername()
        });
    }

    function leaveChatRoom(groupId) {
        if (!socket || !isConnected) return;
        socket.emit('leaveRoom', {
            groupId: groupId,
            username: getCurrentUsername()
        });
    }

    function handleSend() {
        if (!socket || !isConnected || !currentGroupId) return;
        
        const input = document.getElementById('spc-input');
        if (!input) return;
        const content = input.value.trim();
        if (!content) return;

        input.value = '';
        input.style.height = 'auto';

        socket.emit('sendMessage', {
            groupId: currentGroupId,
            userId: getCurrentUserId(),
            username: getCurrentUsername(),
            content: content
        });
    }

    // ─── Jellyfin API Hooks ───────────────────────────────────────────────────
    function hookJellyfinEvents() {
        const tryHook = () => {
            if (typeof window.ApiClient !== 'undefined' && window.ApiClient.messageSubscriptions) {
                const already = window.ApiClient.messageSubscriptions.some(s => s._syncplayChatOwned);
                if (!already) {
                    window.ApiClient.messageSubscriptions.push({
                        _syncplayChatOwned: true,
                        messageType: 'SyncPlayGroupUpdate',
                        callback: (msg) => {
                            const data = typeof msg.Data === 'string' ? JSON.parse(msg.Data) : msg.Data;
                            if (data && data.GroupId) {
                                // Jellyfin native SyncPlay messages: GroupJoined, GroupLeft, NewGroup, etc.
                                if (data.Type === 'GroupJoined' || data.Type === 'LibraryChanged') {
                                    handleGroupJoined(data.GroupId);
                                } else if (data.Type === 'GroupLeft') {
                                    handleGroupLeft();
                                }
                            }
                        }
                    });
                }
                
                // Fallback check: Periodically check SyncPlayManager or URL just in case we miss the WS message
                setInterval(checkFallbackState, 5000);
                checkFallbackState();

                return true;
            }
            return false;
        };

        if (!tryHook()) {
            const interval = setInterval(() => {
                if (tryHook()) clearInterval(interval);
            }, 1000);
        }
    }

    function checkFallbackState() {
        // If there's a SyncPlay button in the header with an active state, it's a hint
        const syncPlayBtn = document.querySelector('.headerSyncPlayButton');
        if (!syncPlayBtn) return;
        
        // Jellyfin SyncPlay API could also be checked via ApiClient.getJSON, 
        // but it's cleaner to rely on the websocket if possible.
        // For now, if we are in a group, the chat is visible. 
    }

    function handleGroupJoined(groupId) {
        if (currentGroupId === groupId) return;
        
        if (currentGroupId) {
            leaveChatRoom(currentGroupId);
        }
        
        currentGroupId = groupId;
        document.getElementById('spc-group-badge').textContent = groupId.substring(0, 8) + '…';
        setActiveState(true);
        setPanelVisibility(true);
        appendSystemMessage('You joined the SyncPlay room 🎬');
        
        if (!socket) {
            connectToChatServer();
        } else {
            joinChatRoom(groupId);
        }
    }

    function handleGroupLeft() {
        if (!currentGroupId) return;
        leaveChatRoom(currentGroupId);
        currentGroupId = null;
        document.getElementById('spc-group-badge').textContent = 'Not in group';
        setActiveState(false);
        setPanelVisibility(false); // Hide the chat when leaving syncplay
    }

    function setActiveState(active) {
        const waiting = document.getElementById('spc-waiting');
        const messages = document.getElementById('spc-messages');
        const inputArea = document.getElementById('spc-input-area');
        
        if (waiting) waiting.style.display = active ? 'none' : 'flex';
        if (messages) messages.style.display = active ? 'flex' : 'none';
        if (inputArea) inputArea.style.display = active ? 'flex' : 'none';
        updateStatusDot();
    }

    function updateStatusDot() {
        const dot = document.getElementById('spc-status-dot');
        if (!dot) return;
        if (currentGroupId && isConnected) {
            dot.style.background = '#4ade80'; // Green
            dot.style.boxShadow = '0 0 6px #4ade80';
        } else if (currentGroupId && !isConnected) {
            dot.style.background = '#fbbf24'; // Yellow (connecting)
            dot.style.boxShadow = '0 0 6px #fbbf24';
        } else {
            dot.style.background = '#f87171'; // Red
            dot.style.boxShadow = '0 0 6px #f87171';
        }
    }

    // ─── DOM Helpers ──────────────────────────────────────────────────────────
    function appendMessageToDOM(msg) {
        const container = document.getElementById('spc-messages');
        if (!container) return;

        const selfId = getCurrentUserId();
        const isOwn = msg.userId === selfId;
        const initials = (msg.username || '?').charAt(0).toUpperCase();
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const el = document.createElement('div');
        el.className = 'spc-msg' + (isOwn ? ' own' : '');
        el.innerHTML = `
            <div class="spc-avatar">${escapeHtml(initials)}</div>
            <div class="spc-bubble">
                <div class="spc-name-row">
                    <span class="spc-username">${escapeHtml(msg.username || 'Unknown')}</span>
                    <span class="spc-time">${time}</span>
                </div>
                <div class="spc-content">${escapeHtml(msg.content)}</div>
            </div>
        `;
        container.appendChild(el);
    }

    function appendSystemMessage(text) {
        const container = document.getElementById('spc-messages');
        if (!container) return;
        const el = document.createElement('div');
        el.className = 'spc-system';
        el.textContent = text;
        container.appendChild(el);
        scrollToBottom();
    }

    function scrollToBottom() {
        const container = document.getElementById('spc-messages');
        if (container) container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ─── User Info Helpers ────────────────────────────────────────────────────
    function getCurrentUserId() {
        try {
            if (typeof window.ApiClient !== 'undefined') {
                return window.ApiClient.getCurrentUserId?.() ?? window.ApiClient._currentUserId ?? 'unknown_id';
            }
        } catch (_) {}
        return 'unknown_id';
    }

    function getCurrentUsername() {
        // Fallback to extract from DOM if ApiClient doesn't expose it directly
        try {
            const userMenuBtn = document.querySelector('.headerUserButton');
            if (userMenuBtn && userMenuBtn.title) {
                return userMenuBtn.title.replace('User ', '').trim();
            }
            // Alternatively, some themes have it in .headerUserButton .userAvatar
            // But we can also look up the user via ApiClient locally
            if (window.ApiClient && window.ApiClient.getCurrentUserId) {
                const id = window.ApiClient.getCurrentUserId();
                // We'd have to make an async call to get the user, but for simplicity:
                return 'User ' + id.substring(0, 4);
            }
        } catch (_) {}
        return 'Jellyfin User';
    }

    // ─── SVG Icons ────────────────────────────────────────────────────────────
    function chatIconSvg() {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c8b8ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    }

    function sendSvg() {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    }

    function arrowSvg(direction) {
        const d = direction === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6';
        return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="${d.replace('M','').replace('l',' ').replace('l',' ')}"/><path d="${d}"/></svg>`;
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    function init() {
        injectStyles();
        buildPanel();
        hookJellyfinEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 800);
    }
})();
