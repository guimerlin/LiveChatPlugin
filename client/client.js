/**
 * Jellyfin SyncPlay Chat — Client Overlay
 * Connects to a standalone Node.js Docker chat server.
 * Features: Player chat button + RAVE-style layout (side-by-side desktop, stacked mobile)
 */
(function () {
    'use strict';

    // ─── Configuration ────────────────────────────────────────────────────────
    const CONFIG = {
        SERVER_URL: 'https://chatsocket.lumini.world',
        CHAT_TITLE: 'SyncPlay Chat',
        PANEL_ID: 'syncplay-chat-panel',
        SCRIPT_TAG: 'syncplaychat-styles',
        WRAPPER_ID: 'syncplay-chat-wrapper',
        PLAYER_BTN_ID: 'spc-player-btn',
        GLOBAL_BTN_ID: 'spc-global-btn',
    };

    // ─── State ────────────────────────────────────────────────────────────────
    let currentGroupId = null;
    let chatOpen = false;
    let socket = null;
    let isConnected = false;
    let playerObserver = null;

    // ─── Detect mobile ────────────────────────────────────────────────────────
    function isMobile() {
        return window.innerWidth <= 768;
    }

    // ─── Styles ───────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById(CONFIG.SCRIPT_TAG)) return;
        const style = document.createElement('style');
        style.id = CONFIG.SCRIPT_TAG;
        style.textContent = `
            :root {
                --spc-bg: #111827;
                --spc-panel-border: rgba(255,255,255,0.08);
                --spc-text: #f9fafb;
                --spc-text-muted: #9ca3af;
                --spc-btn-bg: #1f2937;
                --spc-btn-hover: #374151;
                --spc-header-bg: #1f2937;
                --spc-badge-bg: rgba(59,130,246,0.2);
                --spc-badge-text: #93c5fd;
                --spc-primary: #3b82f6;
                --spc-primary-hover: #60a5fa;
                --spc-input-bg: rgba(255,255,255,0.05);
                --spc-input-border: rgba(255,255,255,0.1);
                --spc-avatar-bg: #374151;
                --spc-avatar-text: #f3f4f6;
                --spc-msg-own-name: #60a5fa;
                --spc-msg-name: #cbd5e1;
                --spc-shadow: rgba(0,0,0,0.5);
            }

            /* ── Player chat button injected into OSD ── */
            #${CONFIG.PLAYER_BTN_ID} {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 40px;
                height: 40px;
                background: transparent;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                color: #fff;
                opacity: 0.85;
                transition: opacity 0.2s, background 0.2s, transform 0.15s;
                position: relative;
            }
            #${CONFIG.PLAYER_BTN_ID}:hover {
                opacity: 1;
                background: rgba(255,255,255,0.1);
                transform: scale(1.1);
            }
            #${CONFIG.PLAYER_BTN_ID}.spc-active {
                color: #3b82f6;
                opacity: 1;
            }
            #spc-player-btn-badge {
                position: absolute;
                top: 4px;
                right: 4px;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                border: 1.5px solid #000;
                display: none;
            }
            #${CONFIG.PLAYER_BTN_ID}.spc-active #spc-player-btn-badge {
                display: block;
            }

            /* ── Floating Global Button ── */
            #${CONFIG.GLOBAL_BTN_ID} {
                position: fixed;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                background: var(--spc-bg);
                color: var(--spc-text);
                border: 1px solid var(--spc-panel-border);
                border-right: none;
                border-radius: 8px 0 0 8px;
                width: 32px;
                height: 48px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 9999;
                box-shadow: -2px 0 8px var(--spc-shadow);
                transition: background 0.2s, opacity 0.3s;
                opacity: 0.8;
            }
            #${CONFIG.GLOBAL_BTN_ID}:hover {
                background: var(--spc-btn-hover);
                opacity: 1;
            }
            body.spc-chat-open #${CONFIG.GLOBAL_BTN_ID} {
                display: none;
            }

            /* ── Room Selection UI ── */
            #spc-room-ui {
                display: none;
                flex-direction: column;
                padding: 20px;
                flex: 1;
                gap: 16px;
                color: var(--spc-text);
            }
            .spc-room-card {
                background: rgba(255,255,255,0.05);
                border: 1px solid var(--spc-panel-border);
                border-radius: 12px;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
            .spc-btn-primary {
                background: var(--spc-primary);
                color: #fff;
                border: none;
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s, transform 0.1s;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }
            .spc-btn-primary:hover { background: var(--spc-primary-hover); transform: scale(1.02); }
            .spc-btn-secondary {
                background: var(--spc-btn-bg);
                color: var(--spc-text);
                border: 1px solid var(--spc-panel-border);
                padding: 10px 16px;
                border-radius: 8px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
                text-align: center;
            }
            .spc-btn-secondary:hover { background: var(--spc-btn-hover); }
            .spc-input-lg {
                background: var(--spc-input-bg);
                border: 1px solid var(--spc-input-border);
                border-radius: 8px;
                padding: 10px 14px;
                color: var(--spc-text);
                font-size: 16px;
                text-align: center;
                letter-spacing: 2px;
                outline: none;
            }
            .spc-input-lg:focus { border-color: var(--spc-primary); }
            .spc-room-header {
                font-size: 14px;
                font-weight: 600;
                color: var(--spc-text-muted);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            #spc-menu-btn {
                background: transparent;
                border: none;
                color: var(--spc-text-muted);
                cursor: pointer;
                padding: 4px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, color 0.2s;
                margin-right: 4px;
            }
            #spc-menu-btn:hover { background: var(--spc-btn-hover); color: var(--spc-text); }
            #spc-group-badge { cursor: pointer; transition: opacity 0.2s; }
            #spc-group-badge:hover { opacity: 0.8; }

            /* ── RAVE-style wrapper: shrinks the video when chat is open ── */
            #${CONFIG.WRAPPER_ID} {
                display: contents;
            }

            /* Desktop: side-by-side layout */
            body.spc-chat-open:not(.spc-mobile) #videoPlayer,
            body.spc-chat-open:not(.spc-mobile) .videoPlayerContainer,
            body.spc-chat-open:not(.spc-mobile) #video-player-container,
            body.spc-chat-open:not(.spc-mobile) .videoOsdBottom,
            body.spc-chat-open:not(.spc-mobile) .osdHeader,
            body.spc-chat-open:not(.spc-mobile) .skinHeader {
                width: calc(100vw - 340px) !important;
                max-width: calc(100vw - 340px) !important;
                transition: width 0.35s cubic-bezier(0.4,0,0.2,1);
            }

            /* Mobile: top/bottom stacked layout */
            body.spc-chat-open.spc-mobile #videoPlayer,
            body.spc-chat-open.spc-mobile .videoPlayerContainer,
            body.spc-chat-open.spc-mobile #video-player-container,
            body.spc-chat-open.spc-mobile .videoOsdBottom,
            body.spc-chat-open.spc-mobile .osdHeader,
            body.spc-chat-open.spc-mobile .skinHeader {
                height: 38vh !important;
                max-height: 38vh !important;
                width: 100vw !important;
                max-width: 100vw !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                transition: height 0.35s cubic-bezier(0.4,0,0.2,1);
            }

            /* ── Chat Panel ── */
            #${CONFIG.PANEL_ID} {
                position: fixed;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                background: var(--spc-bg);
                font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
                color: var(--spc-text);
                transition: transform 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease;
                /* Desktop default: right side */
                top: 0;
                right: 0;
                width: 340px;
                height: 100vh;
                border-left: 1px solid var(--spc-panel-border);
                box-shadow: -4px 0 32px var(--spc-shadow);
                transform: translateX(100%);
                opacity: 0;
                pointer-events: none;
            }

            body.spc-mobile #${CONFIG.PANEL_ID} {
                /* Mobile: bottom panel */
                top: 38vh;
                left: 0;
                right: 0;
                width: 100vw;
                height: calc(62vh - 0px);
                border-left: none;
                border-top: 1px solid var(--spc-panel-border);
                box-shadow: 0 -4px 32px var(--spc-shadow);
                transform: translateY(100%);
            }

            body.spc-chat-open #${CONFIG.PANEL_ID} {
                transform: translateX(0);
                opacity: 1;
                pointer-events: auto;
            }

            body.spc-chat-open.spc-mobile #${CONFIG.PANEL_ID} {
                transform: translateY(0);
            }

            /* ── Header ── */
            #spc-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 14px 10px;
                border-bottom: 1px solid var(--spc-panel-border);
                flex-shrink: 0;
                background: var(--spc-header-bg);
            }

            #spc-title {
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.3px;
                color: var(--spc-text);
                display: flex;
                align-items: center;
                gap: 7px;
            }

            #spc-group-badge {
                font-size: 10px;
                background: var(--spc-badge-bg);
                border-radius: 20px;
                padding: 3px 8px;
                color: var(--spc-badge-text);
                max-width: 130px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-weight: 500;
            }

            #spc-status-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #ef4444;
                flex-shrink: 0;
                transition: background 0.3s;
            }

            #spc-close-btn {
                background: transparent;
                border: none;
                color: var(--spc-text-muted);
                cursor: pointer;
                padding: 4px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, color 0.2s;
            }
            #spc-close-btn:hover { background: var(--spc-btn-hover); color: var(--spc-text); }

            /* ── Messages area ── */
            #spc-messages {
                flex: 1;
                overflow-y: auto;
                padding: 12px 10px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                scrollbar-width: thin;
                scrollbar-color: var(--spc-input-border) transparent;
            }

            #spc-messages::-webkit-scrollbar { width: 4px; }
            #spc-messages::-webkit-scrollbar-thumb {
                background: var(--spc-input-border);
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
                background: var(--spc-avatar-bg);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 11px;
                font-weight: 600;
                color: var(--spc-avatar-text);
                flex-shrink: 0;
                margin-top: 2px;
                text-transform: uppercase;
            }

            .spc-bubble { flex: 1; min-width: 0; }
            .spc-name-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; }
            .spc-username { font-size: 12px; font-weight: 600; color: var(--spc-msg-name); }
            .spc-time { font-size: 10px; color: var(--spc-text-muted); }
            .spc-content { font-size: 13px; line-height: 1.45; color: var(--spc-text); word-break: break-word; white-space: pre-wrap; }
            .spc-msg.own .spc-username { color: var(--spc-msg-own-name); }

            /* ── System message ── */
            .spc-system {
                text-align: center;
                font-size: 11px;
                color: var(--spc-text-muted);
                padding: 6px 0;
                font-style: italic;
            }

            /* ── Input area ── */
            #spc-input-area {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                border-top: 1px solid var(--spc-panel-border);
                flex-shrink: 0;
                background: var(--spc-header-bg);
            }

            #spc-input {
                flex: 1;
                background: var(--spc-input-bg);
                border: 1px solid var(--spc-input-border);
                border-radius: 20px;
                padding: 8px 14px;
                font-size: 13px;
                color: var(--spc-text);
                outline: none;
                font-family: inherit;
                transition: border-color 0.2s;
                resize: none;
                max-height: 80px;
                line-height: 1.4;
            }
            #spc-input::placeholder { color: var(--spc-text-muted); }
            #spc-input:focus { border-color: var(--spc-primary); }

            #spc-send-btn {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: var(--spc-primary);
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: transform 0.15s, background 0.2s;
            }
            #spc-send-btn:hover { transform: scale(1.05); background: var(--spc-primary-hover); }
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
                color: var(--spc-text-muted);
                font-size: 13px;
                text-align: center;
                padding: 24px;
            }

            .spc-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid var(--spc-panel-border);
                border-top-color: var(--spc-primary);
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

        const panel = document.createElement('div');
        panel.id = CONFIG.PANEL_ID;
        panel.setAttribute('role', 'complementary');

        panel.innerHTML = `
            <div id="spc-header">
                <div id="spc-title">
                    ${chatIconSvg()}
                    <span>${CONFIG.CHAT_TITLE}</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                    <span id="spc-status-dot"></span>
                    <span id="spc-group-badge" title="Manage Rooms">Global</span>
                    <button id="spc-menu-btn" aria-label="Menu" title="Menu">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                    <button id="spc-close-btn" aria-label="Close chat" title="Close chat">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>
            
            <div id="spc-room-ui">
                <div class="spc-room-card">
                    <div class="spc-room-header">Current Room</div>
                    <div style="font-size:18px;font-weight:700;" id="spc-current-room-label">Global Chat</div>
                    <button class="spc-btn-secondary" id="spc-btn-leave-room" style="display:none;">Leave Room</button>
                </div>
                <div class="spc-room-card">
                    <div class="spc-room-header">Create Room</div>
                    <button class="spc-btn-primary" id="spc-btn-create-room">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Generate Code & Join
                    </button>
                </div>
                <div class="spc-room-card">
                    <div class="spc-room-header">Join Room</div>
                    <input type="text" id="spc-join-input" class="spc-input-lg" placeholder="1234" maxlength="4">
                    <button class="spc-btn-primary" id="spc-btn-join-room" style="margin-top:8px;">Join</button>
                </div>
                <button class="spc-btn-secondary" style="margin-top:auto;" id="spc-btn-back-chat">Back to Chat</button>
            </div>

            <div id="spc-waiting">
                <div class="spc-spinner"></div>
                <span>Connecting to chat server…</span>
            </div>
            <div id="spc-messages" style="display:none;" aria-live="polite"></div>
            <div id="spc-input-area" style="display:none;">
                <textarea id="spc-input" rows="1" maxlength="500" placeholder="Send a message…"></textarea>
                <button id="spc-send-btn">${sendSvg()}</button>
            </div>
        `;

        document.body.appendChild(panel);

        document.getElementById('spc-close-btn').addEventListener('click', () => closeChat());
        document.getElementById('spc-menu-btn').addEventListener('click', () => toggleRoomUI(true));
        document.getElementById('spc-group-badge').addEventListener('click', () => toggleRoomUI(true));
        document.getElementById('spc-btn-back-chat').addEventListener('click', () => toggleRoomUI(false));
        
        document.getElementById('spc-btn-create-room').addEventListener('click', () => {
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            handleRoomChange(code, 'Room ' + code);
            toggleRoomUI(false);
        });

        document.getElementById('spc-btn-join-room').addEventListener('click', () => {
            const code = document.getElementById('spc-join-input').value.trim();
            if(code.length > 0) {
                handleRoomChange(code, 'Room ' + code);
                document.getElementById('spc-join-input').value = '';
                toggleRoomUI(false);
            }
        });

        document.getElementById('spc-btn-leave-room').addEventListener('click', () => {
            handleRoomChange('global', 'Global Chat');
            toggleRoomUI(false);
        });

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
    }

    function toggleRoomUI(show) {
        const roomUI = document.getElementById('spc-room-ui');
        const msgs = document.getElementById('spc-messages');
        const input = document.getElementById('spc-input-area');
        const waiting = document.getElementById('spc-waiting');
        
        if (show) {
            roomUI.style.display = 'flex';
            msgs.style.display = 'none';
            input.style.display = 'none';
            waiting.style.display = 'none';
            
            const currLabel = document.getElementById('spc-current-room-label');
            const leaveBtn = document.getElementById('spc-btn-leave-room');
            if(currentGroupId === 'global' || !currentGroupId) {
                currLabel.textContent = 'Global Chat';
                leaveBtn.style.display = 'none';
            } else {
                currLabel.textContent = 'Room ' + currentGroupId;
                leaveBtn.style.display = 'block';
            }
        } else {
            roomUI.style.display = 'none';
            setActiveState(true);
        }
    }

    // ─── Chat open / close ────────────────────────────────────────────────────
    function openChat() {
        chatOpen = true;
        updateBodyClasses();
        document.body.classList.add('spc-chat-open');

        const btnP = document.getElementById(CONFIG.PLAYER_BTN_ID);
        if (btnP) btnP.classList.add('spc-active');
    }

    function closeChat() {
        chatOpen = false;
        document.body.classList.remove('spc-chat-open');

        const btnP = document.getElementById(CONFIG.PLAYER_BTN_ID);
        if (btnP) btnP.classList.remove('spc-active');
    }

    function toggleChat() {
        if (chatOpen) closeChat(); else openChat();
    }

    function updateBodyClasses() {
        if (isMobile()) {
            document.body.classList.add('spc-mobile');
        } else {
            document.body.classList.remove('spc-mobile');
        }
    }

    window.addEventListener('resize', () => {
        if (chatOpen) updateBodyClasses();
    });

    // ─── Inject button into Jellyfin player OSD ───────────────────────────────
    function injectPlayerButton() {
        if (document.getElementById(CONFIG.PLAYER_BTN_ID)) return;

        // Known Jellyfin OSD right-side button containers — ordered by specificity
        const targetSelectors = [
            // Modern Jellyfin (10.9+) and custom themes like Finimalism
            '.videoOsdBottom-maincontrols .buttons',
            '.videoOsdBottom-maincontrols .flex-shrink-zero',
            '.videoOsdBottom .buttons',
            '.videoOsdBottom-buttons',
            // Older / alternative layout
            '.videoOsdBottom .flex-shrink-zero',
            '.videoOsdBottom .osdControls',
            '.osdControls',
            // Fallback: full bottom bar
            '.videoOsdBottom',
            // Last resort
            '#videoOsdPage .buttons',
        ];

        let container = null;
        for (const sel of targetSelectors) {
            container = document.querySelector(sel);
            if (container) break;
        }

        if (!container) return;

        const btn = document.createElement('button');
        btn.id = CONFIG.PLAYER_BTN_ID;
        btn.className = 'paper-icon-button-light';
        btn.setAttribute('is', 'paper-icon-button-light');
        btn.setAttribute('aria-label', CONFIG.CHAT_TITLE);
        btn.setAttribute('title', CONFIG.CHAT_TITLE);
        btn.innerHTML = `
            ${chatIconSvg(22)}
            <span id="spc-player-btn-badge"></span>
        `;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChat();
        });

        const settingsBtn = container.querySelector(
            '.btnSettings, .btnVideoSettings, [data-action="settings"], ' +
            '.paper-icon-button-light[title*="etting"], .paper-icon-button-light[title*="onfig"]'
        );
        if (settingsBtn) {
            container.insertBefore(btn, settingsBtn);
        } else {
            container.appendChild(btn);
        }
    }

    // ─── Floating Global Button ───────────────────────────────────────────────
    function injectFloatingButton() {
        if (document.getElementById(CONFIG.GLOBAL_BTN_ID)) return;

        const btn = document.createElement('button');
        btn.id = CONFIG.GLOBAL_BTN_ID;
        btn.setAttribute('aria-label', 'Open ' + CONFIG.CHAT_TITLE);
        btn.setAttribute('title', 'Open ' + CONFIG.CHAT_TITLE);
        
        // Chevron left SVG pointing inwards
        btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleChat();
        });

        document.body.appendChild(btn);
    }

    function watchForUI() {
        if (!playerObserver) {
            playerObserver = new MutationObserver(() => {
                injectFloatingButton();
                injectPlayerButton();
            });
            playerObserver.observe(document.body, { childList: true, subtree: true });
        }
        
        // Fallback polling
        setInterval(() => {
            injectFloatingButton();
            injectPlayerButton();
        }, 2000);
        
        injectFloatingButton();
        injectPlayerButton();
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
                if (!currentGroupId) {
                    handleRoomChange('global', 'Global Chat');
                } else {
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
        socket.emit('joinRoom', { groupId, username: getCurrentUsername() });
    }

    function leaveChatRoom(groupId) {
        if (!socket || !isConnected) return;
        socket.emit('leaveRoom', { groupId, username: getCurrentUsername() });
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
            content
        });
    }

    function handleRoomChange(roomId, roomName) {
        if (currentGroupId === roomId) return;
        if (currentGroupId) leaveChatRoom(currentGroupId);
        currentGroupId = roomId;
        const badge = document.getElementById('spc-group-badge');
        if (badge) badge.textContent = roomName.length > 20 ? roomName.substring(0, 17) + '…' : roomName;
        setActiveState(true);
        appendSystemMessage(`Você entrou: ${roomName} 💬`);
        if (!socket) connectToChatServer();
        else if (isConnected) joinChatRoom(roomId);
    }

    function setActiveState(active) {
        const roomUI = document.getElementById('spc-room-ui');
        if (roomUI && roomUI.style.display === 'flex') return; // Don't override if room menu is open

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
            dot.style.background = '#10b981';
        } else if (currentGroupId && !isConnected) {
            dot.style.background = '#f59e0b';
        } else {
            dot.style.background = '#ef4444';
        }
    }

    // ─── DOM Helpers ──────────────────────────────────────────────────────────
    function appendMessageToDOM(msg) {
        if (msg.isSystem) { appendSystemMessage(msg.content); return; }
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
        try {
            const userMenuBtn = document.querySelector('.headerUserButton');
            if (userMenuBtn && userMenuBtn.title) return userMenuBtn.title.replace('User ', '').trim();
            if (window.ApiClient && window.ApiClient.getCurrentUserId) {
                const id = window.ApiClient.getCurrentUserId();
                return 'User ' + id.substring(0, 4);
            }
        } catch (_) {}
        return 'Jellyfin User';
    }

    // ─── SVG Icons ────────────────────────────────────────────────────────────
    function chatIconSvg(size = 16) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
    }

    function sendSvg() {
        return `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
    }

    // ─── Init ─────────────────────────────────────────────────────────────────
    function init() {
        injectStyles();
        buildPanel();
        connectToChatServer();
        watchForUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        setTimeout(init, 800);
    }
})();
