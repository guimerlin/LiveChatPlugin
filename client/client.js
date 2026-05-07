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

        // Inject Google Fonts
        const fontLink = document.createElement('link');
        fontLink.rel = 'preconnect';
        fontLink.href = 'https://fonts.googleapis.com';
        document.head.appendChild(fontLink);
        const fontLink2 = document.createElement('link');
        fontLink2.rel = 'stylesheet';
        fontLink2.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap';
        document.head.appendChild(fontLink2);

        const style = document.createElement('style');
        style.id = CONFIG.SCRIPT_TAG;
        style.textContent = `
            :root {
                --spc-bg: #0a0c10;
                --spc-surface: #10141c;
                --spc-surface-2: #161b26;
                --spc-surface-3: #1c2333;
                --spc-border: rgba(255,255,255,0.06);
                --spc-border-hover: rgba(255,255,255,0.12);
                --spc-text: #e8eaf0;
                --spc-text-2: #8b92a8;
                --spc-text-3: #4e5568;
                --spc-accent: #6c8aff;
                --spc-accent-2: #a78bfa;
                --spc-accent-glow: rgba(108,138,255,0.18);
                --spc-green: #34d399;
                --spc-amber: #fbbf24;
                --spc-red: #f87171;
                --spc-shadow-sm: 0 2px 8px rgba(0,0,0,0.4);
                --spc-shadow: 0 8px 40px rgba(0,0,0,0.6);
                --spc-shadow-lg: 0 20px 60px rgba(0,0,0,0.8);
                --spc-font: 'DM Sans', system-ui, sans-serif;
                --spc-font-mono: 'DM Mono', monospace;
                --spc-radius: 16px;
                --spc-radius-sm: 10px;
                --spc-width: 360px;
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
                color: rgba(255,255,255,0.7);
                transition: color 0.2s, background 0.2s, transform 0.15s;
                position: relative;
            }
            #${CONFIG.PLAYER_BTN_ID}:hover {
                color: #fff;
                background: rgba(255,255,255,0.08);
                transform: scale(1.1);
            }
            #${CONFIG.PLAYER_BTN_ID}.spc-active {
                color: var(--spc-accent);
            }
            #spc-player-btn-badge {
                position: absolute;
                top: 5px;
                right: 5px;
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: var(--spc-green);
                border: 1.5px solid #000;
                display: none;
                box-shadow: 0 0 6px var(--spc-green);
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
                background: var(--spc-surface);
                color: var(--spc-text-2);
                border: 1px solid var(--spc-border);
                border-right: none;
                border-radius: 12px 0 0 12px;
                width: 28px;
                height: 52px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 9999;
                box-shadow: -4px 0 20px rgba(0,0,0,0.5);
                transition: background 0.2s, color 0.2s, width 0.2s;
            }
            #${CONFIG.GLOBAL_BTN_ID}:hover {
                background: var(--spc-surface-3);
                color: var(--spc-text);
                width: 32px;
            }
            body.spc-chat-open #${CONFIG.GLOBAL_BTN_ID} {
                display: none;
            }

            /* ── Room Selection UI ── */
            #spc-room-ui {
                display: none;
                flex-direction: column;
                padding: 20px 16px;
                flex: 1;
                gap: 12px;
                overflow-y: auto;
            }
            .spc-room-card {
                background: var(--spc-surface-2);
                border: 1px solid var(--spc-border);
                border-radius: var(--spc-radius-sm);
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 10px;
                transition: border-color 0.2s;
            }
            .spc-room-card:hover {
                border-color: var(--spc-border-hover);
            }
            .spc-btn-primary {
                background: linear-gradient(135deg, var(--spc-accent), var(--spc-accent-2));
                color: #fff;
                border: none;
                padding: 10px 16px;
                border-radius: var(--spc-radius-sm);
                font-weight: 600;
                font-size: 13px;
                font-family: var(--spc-font);
                cursor: pointer;
                transition: opacity 0.2s, transform 0.15s, box-shadow 0.2s;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                letter-spacing: 0.2px;
                box-shadow: 0 4px 16px rgba(108,138,255,0.3);
            }
            .spc-btn-primary:hover {
                opacity: 0.9;
                transform: translateY(-1px);
                box-shadow: 0 6px 20px rgba(108,138,255,0.4);
            }
            .spc-btn-primary:active { transform: translateY(0); }
            .spc-btn-secondary {
                background: var(--spc-surface-3);
                color: var(--spc-text-2);
                border: 1px solid var(--spc-border);
                padding: 10px 16px;
                border-radius: var(--spc-radius-sm);
                font-weight: 500;
                font-size: 13px;
                font-family: var(--spc-font);
                cursor: pointer;
                transition: background 0.2s, color 0.2s, border-color 0.2s;
                text-align: center;
            }
            .spc-btn-secondary:hover {
                background: var(--spc-surface-3);
                border-color: var(--spc-border-hover);
                color: var(--spc-text);
            }
            .spc-input-lg {
                background: var(--spc-surface-3);
                border: 1px solid var(--spc-border);
                border-radius: var(--spc-radius-sm);
                padding: 11px 14px;
                color: var(--spc-text);
                font-size: 22px;
                font-family: var(--spc-font-mono);
                font-weight: 500;
                text-align: center;
                letter-spacing: 6px;
                outline: none;
                transition: border-color 0.2s, box-shadow 0.2s;
            }
            .spc-input-lg:focus {
                border-color: var(--spc-accent);
                box-shadow: 0 0 0 3px var(--spc-accent-glow);
            }
            .spc-input-lg::placeholder {
                color: var(--spc-text-3);
                letter-spacing: 4px;
            }
            .spc-room-label {
                font-size: 11px;
                font-weight: 600;
                color: var(--spc-text-3);
                text-transform: uppercase;
                letter-spacing: 1px;
            }

            #spc-menu-btn {
                background: transparent;
                border: none;
                color: var(--spc-text-3);
                cursor: pointer;
                padding: 5px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, color 0.2s;
            }
            #spc-menu-btn:hover {
                background: var(--spc-surface-3);
                color: var(--spc-text);
            }

            /* ── RAVE-style wrapper ── */
            #${CONFIG.WRAPPER_ID} {
                display: contents;
            }

            /* Desktop: side-by-side */
            body.spc-chat-open:not(.spc-mobile) #videoPlayer,
            body.spc-chat-open:not(.spc-mobile) .videoPlayerContainer,
            body.spc-chat-open:not(.spc-mobile) #video-player-container,
            body.spc-chat-open:not(.spc-mobile) .videoOsdBottom,
            body.spc-chat-open:not(.spc-mobile) .osdHeader,
            body.spc-chat-open:not(.spc-mobile) .skinHeader {
                width: calc(100vw - var(--spc-width)) !important;
                max-width: calc(100vw - var(--spc-width)) !important;
                transition: width 0.35s cubic-bezier(0.4,0,0.2,1);
            }

            /* Mobile: stacked */
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
                font-family: var(--spc-font);
                color: var(--spc-text);
                transition: transform 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease;
                /* Desktop: right side */
                top: 0;
                right: 0;
                width: var(--spc-width);
                height: 100vh;
                border-left: 1px solid var(--spc-border);
                box-shadow: var(--spc-shadow-lg);
                transform: translateX(100%);
                opacity: 0;
                pointer-events: none;
            }

            /* Subtle gradient noise texture overlay */
            #${CONFIG.PANEL_ID}::before {
                content: '';
                position: absolute;
                inset: 0;
                background:
                    radial-gradient(ellipse 60% 40% at 50% 0%, rgba(108,138,255,0.06) 0%, transparent 70%),
                    radial-gradient(ellipse 40% 30% at 80% 100%, rgba(167,139,250,0.04) 0%, transparent 60%);
                pointer-events: none;
                z-index: 0;
            }

            #${CONFIG.PANEL_ID} > * { position: relative; z-index: 1; }

            body.spc-mobile #${CONFIG.PANEL_ID} {
                top: 38vh;
                left: 0;
                right: 0;
                width: 100vw;
                height: calc(62vh);
                border-left: none;
                border-top: 1px solid var(--spc-border);
                box-shadow: 0 -8px 40px rgba(0,0,0,0.7);
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
                padding: 14px 16px 13px;
                border-bottom: 1px solid var(--spc-border);
                flex-shrink: 0;
                background: rgba(10,12,16,0.85);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
            }

            #spc-title {
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.1px;
                color: var(--spc-text);
                display: flex;
                align-items: center;
                gap: 8px;
            }

            #spc-title-icon {
                width: 28px;
                height: 28px;
                border-radius: 8px;
                background: linear-gradient(135deg, var(--spc-accent), var(--spc-accent-2));
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 10px rgba(108,138,255,0.35);
                flex-shrink: 0;
            }

            #spc-group-badge {
                font-size: 10px;
                font-weight: 600;
                font-family: var(--spc-font-mono);
                background: var(--spc-surface-3);
                border: 1px solid var(--spc-border);
                border-radius: 20px;
                padding: 3px 9px;
                color: var(--spc-text-2);
                max-width: 110px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                cursor: pointer;
                transition: border-color 0.2s, color 0.2s, background 0.2s;
                letter-spacing: 0.3px;
            }
            #spc-group-badge:hover {
                border-color: var(--spc-accent);
                color: var(--spc-accent);
                background: var(--spc-accent-glow);
            }

            #spc-status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: var(--spc-red);
                flex-shrink: 0;
                transition: background 0.3s;
                box-shadow: 0 0 0 2px transparent;
            }
            #spc-status-dot.connected {
                background: var(--spc-green);
                box-shadow: 0 0 6px var(--spc-green);
                animation: spc-pulse 2.5s ease-in-out infinite;
            }

            @keyframes spc-pulse {
                0%, 100% { box-shadow: 0 0 4px var(--spc-green); }
                50% { box-shadow: 0 0 10px var(--spc-green), 0 0 20px rgba(52,211,153,0.3); }
            }

            #spc-close-btn {
                background: transparent;
                border: none;
                color: var(--spc-text-3);
                cursor: pointer;
                padding: 5px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s, color 0.2s;
            }
            #spc-close-btn:hover {
                background: rgba(248,113,113,0.12);
                color: var(--spc-red);
            }

            /* ── Messages area ── */
            #spc-messages {
                flex: 1;
                overflow-y: auto;
                padding: 14px 12px;
                display: flex;
                flex-direction: column;
                gap: 2px;
                scrollbar-width: thin;
                scrollbar-color: var(--spc-surface-3) transparent;
            }

            #spc-messages::-webkit-scrollbar { width: 3px; }
            #spc-messages::-webkit-scrollbar-thumb {
                background: var(--spc-surface-3);
                border-radius: 2px;
            }

            /* ── Message bubble ── */
            .spc-msg {
                display: flex;
                align-items: flex-start;
                gap: 9px;
                padding: 5px 4px;
                border-radius: var(--spc-radius-sm);
                animation: spc-slide-in 0.25s cubic-bezier(0.4,0,0.2,1);
                transition: background 0.15s;
            }
            .spc-msg:hover {
                background: rgba(255,255,255,0.025);
            }

            @keyframes spc-slide-in {
                from { opacity: 0; transform: translateY(8px); }
                to   { opacity: 1; transform: translateY(0); }
            }

            .spc-avatar {
                width: 30px;
                height: 30px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: 700;
                flex-shrink: 0;
                margin-top: 1px;
                text-transform: uppercase;
                letter-spacing: -0.5px;
            }

            .spc-bubble { flex: 1; min-width: 0; }
            .spc-name-row {
                display: flex;
                align-items: baseline;
                gap: 6px;
                margin-bottom: 3px;
            }
            .spc-username {
                font-size: 12px;
                font-weight: 600;
                letter-spacing: 0.1px;
            }
            .spc-time {
                font-size: 10px;
                color: var(--spc-text-3);
                font-family: var(--spc-font-mono);
                font-weight: 400;
            }
            .spc-content {
                font-size: 13px;
                line-height: 1.5;
                color: var(--spc-text);
                word-break: break-word;
                white-space: pre-wrap;
                font-weight: 400;
            }

            /* ── System message ── */
            .spc-system {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-size: 11px;
                color: var(--spc-text-3);
                padding: 8px 0;
                font-family: var(--spc-font-mono);
                letter-spacing: 0.3px;
            }
            .spc-system::before,
            .spc-system::after {
                content: '';
                flex: 1;
                height: 1px;
                background: var(--spc-border);
            }

            /* ── Input area ── */
            #spc-input-area {
                display: flex;
                align-items: flex-end;
                gap: 8px;
                padding: 12px 14px;
                border-top: 1px solid var(--spc-border);
                flex-shrink: 0;
                background: rgba(10,12,16,0.9);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
            }

            #spc-input {
                flex: 1;
                background: var(--spc-surface-2);
                border: 1px solid var(--spc-border);
                border-radius: 12px;
                padding: 9px 14px;
                font-size: 13px;
                color: var(--spc-text);
                outline: none;
                font-family: var(--spc-font);
                font-weight: 400;
                transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
                resize: none;
                max-height: 80px;
                line-height: 1.5;
            }
            #spc-input::placeholder { color: var(--spc-text-3); }
            #spc-input:focus {
                border-color: rgba(108,138,255,0.4);
                box-shadow: 0 0 0 3px var(--spc-accent-glow);
                background: var(--spc-surface-3);
            }

            #spc-send-btn {
                width: 36px;
                height: 36px;
                border-radius: 11px;
                background: linear-gradient(135deg, var(--spc-accent), var(--spc-accent-2));
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                transition: transform 0.15s, box-shadow 0.2s, opacity 0.2s;
                box-shadow: 0 4px 14px rgba(108,138,255,0.4);
            }
            #spc-send-btn:hover {
                transform: scale(1.06) translateY(-1px);
                box-shadow: 0 6px 20px rgba(108,138,255,0.5);
            }
            #spc-send-btn:active { transform: scale(0.95); }

            /* ── Waiting state ── */
            #spc-waiting {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 14px;
                color: var(--spc-text-3);
                font-size: 13px;
                text-align: center;
                padding: 24px;
            }

            .spc-spinner {
                width: 28px;
                height: 28px;
                border: 2px solid var(--spc-surface-3);
                border-top-color: var(--spc-accent);
                border-radius: 50%;
                animation: spc-spin 0.8s linear infinite;
            }

            @keyframes spc-spin { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    // ─── Avatar color palette based on username hash ──────────────────────────
    const AVATAR_COLORS = [
        ['#6c8aff','#1a2040'],['#a78bfa','#1e1635'],['#34d399','#0d2b22'],
        ['#fb923c','#2b1a0e'],['#f472b6','#2b1020'],['#38bdf8','#0d2030'],
        ['#facc15','#2b2510'],['#4ade80','#0d2b15'],
    ];
    function avatarColor(username) {
        let h = 0;
        for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) & 0xffffffff;
        return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
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
                    <div id="spc-title-icon">
                        ${chatIconSvg(14)}
                    </div>
                    <span>${CONFIG.CHAT_TITLE}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                    <span id="spc-status-dot"></span>
                    <span id="spc-group-badge" title="Gerenciar salas">Global</span>
                    <button id="spc-menu-btn" aria-label="Menu" title="Menu">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="1.2"></circle><circle cx="12" cy="5" r="1.2"></circle><circle cx="12" cy="19" r="1.2"></circle></svg>
                    </button>
                    <button id="spc-close-btn" aria-label="Fechar chat" title="Fechar chat">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </div>

            <div id="spc-room-ui">
                <div class="spc-room-card">
                    <div class="spc-room-label">Sala atual</div>
                    <div style="font-size:16px;font-weight:700;color:var(--spc-text);" id="spc-current-room-label">Global Chat</div>
                    <button class="spc-btn-secondary" id="spc-btn-leave-room" style="display:none;">Sair da sala</button>
                </div>
                <div class="spc-room-card">
                    <div class="spc-room-label">Criar sala</div>
                    <p style="font-size:12px;color:var(--spc-text-2);margin:0;">Gera um código de 4 dígitos para compartilhar com seus amigos.</p>
                    <button class="spc-btn-primary" id="spc-btn-create-room">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Gerar código e entrar
                    </button>
                </div>
                <div class="spc-room-card">
                    <div class="spc-room-label">Entrar em sala</div>
                    <input type="text" id="spc-join-input" class="spc-input-lg" placeholder="0000" maxlength="4" inputmode="numeric">
                    <button class="spc-btn-primary" id="spc-btn-join-room" style="margin-top:4px;">Entrar</button>
                </div>
                <button class="spc-btn-secondary" style="margin-top:auto;" id="spc-btn-back-chat">← Voltar ao chat</button>
            </div>

            <div id="spc-waiting">
                <div class="spc-spinner"></div>
                <span>Conectando ao servidor…</span>
            </div>
            <div id="spc-messages" style="display:none;" aria-live="polite"></div>
            <div id="spc-input-area" style="display:none;">
                <textarea id="spc-input" rows="1" maxlength="500" placeholder="Escreva uma mensagem…"></textarea>
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
            handleRoomChange(code, 'Sala ' + code);
            toggleRoomUI(false);
        });

        document.getElementById('spc-btn-join-room').addEventListener('click', () => {
            const code = document.getElementById('spc-join-input').value.trim();
            if(code.length > 0) {
                handleRoomChange(code, 'Sala ' + code);
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
                currLabel.textContent = 'Sala ' + currentGroupId;
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

        const targetSelectors = [
            '.videoOsdBottom-maincontrols .buttons',
            '.videoOsdBottom-maincontrols .flex-shrink-zero',
            '.videoOsdBottom .buttons',
            '.videoOsdBottom-buttons',
            '.videoOsdBottom .flex-shrink-zero',
            '.videoOsdBottom .osdControls',
            '.osdControls',
            '.videoOsdBottom',
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
        btn.setAttribute('aria-label', 'Abrir ' + CONFIG.CHAT_TITLE);
        btn.setAttribute('title', 'Abrir ' + CONFIG.CHAT_TITLE);
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
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
        if (badge) badge.textContent = roomName.length > 18 ? roomName.substring(0, 15) + '…' : roomName;
        setActiveState(true);
        appendSystemMessage(`Você entrou: ${roomName}`);
        if (!socket) connectToChatServer();
        else if (isConnected) joinChatRoom(roomId);
    }

    function setActiveState(active) {
        const roomUI = document.getElementById('spc-room-ui');
        if (roomUI && roomUI.style.display === 'flex') return;

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
            dot.style.background = 'var(--spc-green)';
            dot.style.boxShadow = '0 0 6px var(--spc-green)';
            dot.classList.add('connected');
        } else if (currentGroupId && !isConnected) {
            dot.style.background = 'var(--spc-amber)';
            dot.style.boxShadow = '0 0 6px var(--spc-amber)';
            dot.classList.remove('connected');
        } else {
            dot.style.background = 'var(--spc-red)';
            dot.style.boxShadow = 'none';
            dot.classList.remove('connected');
        }
    }

    // ─── DOM Helpers ──────────────────────────────────────────────────────────
    function appendMessageToDOM(msg) {
        if (msg.isSystem) { appendSystemMessage(msg.content); return; }
        const container = document.getElementById('spc-messages');
        if (!container) return;
        const selfId = getCurrentUserId();
        const isOwn = msg.userId === selfId;
        const username = msg.username || 'Unknown';
        const initials = username.charAt(0).toUpperCase();
        const [fgColor, bgColor] = avatarColor(username);
        const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const nameColor = isOwn ? 'var(--spc-accent)' : fgColor;

        const el = document.createElement('div');
        el.className = 'spc-msg' + (isOwn ? ' own' : '');
        el.innerHTML = `
            <div class="spc-avatar" style="background:${bgColor};color:${fgColor};">${escapeHtml(initials)}</div>
            <div class="spc-bubble">
                <div class="spc-name-row">
                    <span class="spc-username" style="color:${nameColor};">${escapeHtml(username)}</span>
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
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
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
