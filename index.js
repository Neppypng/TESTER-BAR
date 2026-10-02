// Welcome Favorites — a row of your favorite characters and groups on SillyTavern's welcome screen.
// The row is placed *inside* the "Recent Chats" title element, so no elements of the welcome
// panel are added, removed or reordered — themes that style the panel's layout keep working.
(function () {
    const MODULE = 'welcomeFavorites';

    const SHAPES = [
        ['card', 'Card'],
        ['square', 'Rounded square'],
        ['circle', 'Circle'],
        ['hexagon', 'Hexagon'],
    ];

    // Settings panel layout + defaults. Every setting is a dropdown.
    const SPEC = [
        { section: 'General' },
        { key: 'enabled', label: 'Favorites bar', onoff: true, def: true },
        { key: 'live', label: 'Live updates', onoff: true, def: true },
        { key: 'groups', label: 'Include group chats', onoff: true, def: true },

        { section: 'Display' },
        { key: 'shape', label: 'Icon shape', options: SHAPES, def: 'card' },
        { key: 'size', label: 'Icon size', options: [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], def: 'medium' },
        {
            key: 'sort', label: 'Sort by', def: 'favorites', options: [
                ['favorites', 'Off (favorited order)'],
                ['az', 'Name (A\u2013Z)'],
                ['za', 'Name (Z\u2013A)'],
                ['recent', 'Recently chatted'],
                ['messages', 'Most messages'],
            ],
        },
        { key: 'names', label: 'Show names', onoff: true, def: true },
        { key: 'counts', label: 'Show chat counts', onoff: true, def: true },
        { key: 'messages', label: 'Show message count', onoff: true, def: true },
        { key: 'lastChat', label: 'Show last chatted', onoff: true, def: false },

        { section: 'Heartbeat' },
        { key: 'heartbeat', label: 'Heartbeat glow', onoff: true, def: false },
        { key: 'beatSpeed', label: 'Speed', options: [['slow', 'Slow'], ['steady', 'Steady'], ['racing', 'Racing']], def: 'steady' },
        { key: 'beatStrength', label: 'Intensity', options: [['soft', 'Soft'], ['medium', 'Medium'], ['strong', 'Strong']], def: 'medium' },

        { section: 'Behavior' },
        { key: 'tap', label: 'Tap to open', options: [['last', 'Last chat'], ['new', 'New chat']], def: 'last' },
        { key: 'longPress', label: 'Long-press menu', onoff: true, def: true },
    ];

    const SIZES = { small: 0.8, medium: 1, large: 1.22 };
    const BEAT_SPEED = { slow: '2.6s', steady: '1.8s', racing: '0.9s' };
    const BEAT_STRENGTH = {
        soft: { rest: '1px', peak: '5px' },
        medium: { rest: '2px', peak: '9px' },
        strong: { rest: '3px', peak: '14px' },
    };

    const ctx = () => SillyTavern.getContext();
    const isFav = (x) => x && (x.fav === true || x.fav === 'true');
    const thumb = (file) => `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    // ---------- Settings ----------
    function getSettings() {
        const c = ctx();
        const store = c.extensionSettings || (window.__wfSettings ??= {});
        const s = (store[MODULE] ??= {});
        if (s.sort === 'chats') s.sort = 'messages'; // older setting name
        delete s.themes; // custom themes from an earlier version are no longer used
        if (typeof s.theme !== 'string') s.theme = 'auto';
        if (OLD_THEME_IDS[s.theme]) s.theme = OLD_THEME_IDS[s.theme];
        for (const item of SPEC) {
            if (!item.key) continue;
            if (item.onoff) {
                if (typeof s[item.key] !== 'boolean') s[item.key] = item.def;
            } else if (!item.options.some(([v]) => v === s[item.key])) {
                s[item.key] = item.def;
            }
        }
        return s;
    }
    const saveSettings = () => ctx().saveSettingsDebounced?.();

    // ---------- Helpers ----------
    function timeAgo(ts) {
        const t = Number(ts);
        if (!t) return '';
        const s = (Date.now() - t) / 1000;
        if (s < 60) return 'just now';
        const m = s / 60;
        if (m < 60) return `${Math.floor(m)}m ago`;
        const h = m / 60;
        if (h < 24) return `${Math.floor(h)}h ago`;
        const d = h / 24;
        if (d < 7) return `${Math.floor(d)}d ago`;
        if (d < 35) return `${Math.floor(d / 7)}w ago`;
        if (d < 365) return `${Math.floor(d / 30)}mo ago`;
        return `${Math.floor(d / 365)}y ago`;
    }

    // Chat stats: how many chats, and how many messages are in the chat the bot is currently on.
    // Characters: one small listing request each. Groups: one small info request. Both cached.
    const statsCache = new Map(); // key -> { chats, messages, stamp }
    const stamp = (item) => `${item.last}|${item.chatFile ?? item.chatId ?? ''}`;
    function cachedStats(item) {
        const hit = statsCache.get(item.key);
        const s = hit && hit.stamp === stamp(item) ? hit : {};
        return {
            chats: item.type === 'group' ? item.groupChats : s.chats,
            messages: s.messages,
            loaded: Boolean(hit && hit.stamp === stamp(item)),
        };
    }
    async function fetchStats(item) {
        if (cachedStats(item).loaded) return;
        const headers = ctx().getRequestHeaders();
        const entry = { chats: undefined, messages: undefined, stamp: stamp(item) };
        try {
            if (item.type === 'char') {
                const res = await fetch('/api/characters/chats', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ avatar_url: item.avatar }),
                });
                if (res.ok) {
                    let data = await res.json();
                    if (!Array.isArray(data)) data = data && !data.error ? Object.values(data) : [];
                    entry.chats = data.length;
                    const current = data.find((c) => String(c.file_name).replace(/\.jsonl$/, '') === item.chatFile);
                    if (current && typeof current.chat_items === 'number') entry.messages = current.chat_items;
                }
            } else if (item.chatId) {
                const res = await fetch('/api/chats/group/info', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ id: item.chatId }),
                });
                if (res.ok) {
                    const info = await res.json();
                    if (typeof info?.chat_items === 'number') entry.messages = info.chat_items;
                }
            }
        } catch {
            /* leave unknown */
        }
        statsCache.set(item.key, entry);
    }

    // ---------- Data ----------
    function getItems(settings) {
        const c = ctx();
        const items = [];
        (c.characters || []).forEach((ch, i) => {
            if (!isFav(ch)) return;
            items.push({
                type: 'char',
                key: `c:${ch.avatar}`,
                index: i,
                name: ch.name,
                avatar: ch.avatar,
                chatFile: ch.chat,
                last: Number(ch.date_last_chat) || 0,
            });
        });
        if (settings.groups) {
            (c.groups || []).forEach((g) => {
                if (!isFav(g)) return;
                items.push({
                    type: 'group',
                    key: `g:${g.id}`,
                    id: g.id,
                    chatId: g.chat_id,
                    name: g.name,
                    groupAvatar: g.avatar_url,
                    members: (g.members || []).slice(0, 4),
                    groupChats: Array.isArray(g.chats) ? g.chats.length : undefined,
                    last: Number(g.date_last_chat) || 0,
                });
            });
        }

        const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        switch (settings.sort) {
            case 'az': items.sort(byName); break;
            case 'za': items.sort((a, b) => byName(b, a)); break;
            case 'recent': items.sort((a, b) => b.last - a.last); break;
            case 'messages': items.sort((a, b) => (cachedStats(b).messages ?? -1) - (cachedStats(a).messages ?? -1)); break;
        }
        return items;
    }

    // Fingerprint of everything shown; when it changes, the row is rebuilt (live updates).
    const signature = (items) => items.map((x) => `${x.key}|${x.name}|${stamp(x)}|${x.groupChats ?? ''}|${x.groupAvatar ?? ''}`).join('\n');

    // ---------- Opening chats ----------
    async function openItem(item, mode) {
        const c = ctx();
        if (item.type === 'char') {
            await c.selectCharacterById(String(item.index));
        } else if (item.chatId) {
            await c.openGroupChat(item.id, item.chatId);
        } else {
            return;
        }
        if (mode === 'new') {
            await delay(500);
            document.getElementById('option_start_new_chat')?.click(); // SillyTavern's own "Start new chat"
        }
    }

    async function openCard(item) {
        await ctx().selectCharacterById(String(item.index));
        const panel = document.getElementById('right-nav-panel');
        if (panel && !panel.classList.contains('openDrawer')) {
            document.getElementById('rightNavDrawerIcon')?.click();
        }
    }

    async function confirmAction(text) {
        const c = ctx();
        if (c.callGenericPopup && c.POPUP_TYPE) {
            return Boolean(await c.callGenericPopup(text, c.POPUP_TYPE.CONFIRM));
        }
        return window.confirm(text);
    }

    async function unfavorite(item) {
        if (!(await confirmAction(`Remove ${item.name} from favorites?`))) return;
        const c = ctx();
        try {
            if (item.type === 'char') {
                const ch = c.characters[item.index];
                await fetch('/api/characters/merge-attributes', {
                    method: 'POST',
                    headers: c.getRequestHeaders(),
                    body: JSON.stringify({ avatar: item.avatar, fav: false, data: { extensions: { fav: false } } }),
                });
                if (ch) ch.fav = false;
                await c.getCharacters?.();
            } else {
                const g = (c.groups || []).find((x) => x.id === item.id);
                if (g) {
                    g.fav = false;
                    await fetch('/api/groups/edit', {
                        method: 'POST',
                        headers: c.getRequestHeaders(),
                        body: JSON.stringify(g),
                    });
                }
            }
        } catch (e) {
            console.error('[Welcome Favorites] Could not unfavorite', e);
        }
        rebuild();
    }

    // ---------- Long-press menu ----------
    function closeMenu() {
        document.querySelectorAll('.wf-menu').forEach((m) => m.remove());
    }

    function openMenu(item, card) {
        closeMenu();
        const menu = document.createElement('div');
        menu.className = 'wf-menu';

        const title = document.createElement('div');
        title.className = 'wf-menu-title';
        title.textContent = item.name;
        menu.append(title);

        const add = (icon, label, fn) => {
            const b = document.createElement('button');
            b.className = 'wf-menu-item';
            b.innerHTML = `<i class="fa-solid ${icon} fa-fw"></i>`;
            const span = document.createElement('span');
            span.textContent = label;
            b.append(span);
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                closeMenu();
                fn();
            });
            menu.append(b);
        };
        add('fa-comments', 'Open last chat', () => openItem(item, 'last'));
        add('fa-comment-medical', 'Start new chat', () => openItem(item, 'new'));
        if (item.type === 'char') add('fa-id-card', 'Open character card', () => openCard(item));
        add('fa-star-half-stroke', 'Remove from favorites', () => unfavorite(item));

        document.body.append(menu);
        const r = card.getBoundingClientRect();
        const mw = menu.offsetWidth;
        const mh = menu.offsetHeight;
        let left = r.left + r.width / 2 - mw / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
        let top = r.bottom + 6;
        if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 6);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;

        const cleanup = () => {
            document.removeEventListener('pointerdown', outside, true);
            document.removeEventListener('keydown', onKey);
        };
        const outside = (e) => {
            if (!menu.contains(e.target)) {
                closeMenu();
                cleanup();
            }
        };
        const onKey = (e) => {
            if (e.key === 'Escape') {
                closeMenu();
                cleanup();
            }
        };
        setTimeout(() => {
            document.addEventListener('pointerdown', outside, true);
            document.addEventListener('keydown', onKey);
        }, 0);
    }

    // ---------- Build ----------
    function findRecentHeading(chat) {
        return (
            chat.querySelector('.welcomePanel .recentChatsTitle') ||
            [...chat.querySelectorAll('*')].find(
                (el) => el.children.length === 0 && el.textContent.trim() === 'Recent Chats',
            )
        );
    }

    function infoText(item, settings) {
        const st = cachedStats(item);
        const parts = [];
        if (settings.counts && st.chats !== undefined) parts.push(`${st.chats} chat${st.chats === 1 ? '' : 's'}`);
        if (settings.messages && st.messages !== undefined) parts.push(`${st.messages} msg${st.messages === 1 ? '' : 's'}`);
        if (settings.lastChat && item.last) parts.push(timeAgo(item.last));
        return parts.join(' \u00B7 ');
    }

    function makeMedia(item) {
        if (item.type === 'char' || item.groupAvatar) {
            const img = document.createElement('img');
            img.className = 'wf-media';
            img.src = item.type === 'char' ? thumb(item.avatar) : item.groupAvatar;
            img.alt = item.name;
            img.loading = 'lazy';
            img.draggable = false;
            return img;
        }
        // Group without its own picture: collage of up to 4 members
        const collage = document.createElement('div');
        collage.className = `wf-media wf-collage wf-collage-${Math.max(1, item.members.length)}`;
        for (const m of item.members) {
            const img = document.createElement('img');
            img.src = thumb(m);
            img.alt = '';
            img.loading = 'lazy';
            img.draggable = false;
            collage.append(img);
        }
        return collage;
    }

    function makeCard(item, settings, style = 'classic', crownStyle = 'lace') {
        const card = document.createElement('button');
        card.className = `wf-card${item.type === 'group' ? ' wf-group' : ''}`;
        card.title = item.name;
        card.dataset.key = item.key;

        const frame = document.createElement('div');
        frame.className = 'wf-frame';
        // ring: an extra layer around the picture; themes like Vampire draw their gradient ring on it
        const ring = document.createElement('div');
        ring.className = 'wf-ring';
        ring.append(makeMedia(item));
        frame.append(ring);
        if (style === 'vampire' || style === 'blood') frame.insertAdjacentHTML('beforeend', crownStyle === 'solid' ? solidCrownSvg() : CROWN_SVG);
        if (item.type === 'group') {
            const badge = document.createElement('span');
            badge.className = 'wf-badge';
            badge.title = 'Group chat';
            badge.innerHTML = '<i class="fa-solid fa-users"></i>';
            frame.append(badge);
        }
        card.append(frame);

        if (settings.names) {
            const name = document.createElement('span');
            name.className = 'wf-name';
            name.textContent = item.name;
            card.append(name);
        }
        if (settings.counts || settings.messages || settings.lastChat) {
            const info = document.createElement('span');
            info.className = 'wf-info';
            info.textContent = infoText(item, settings);
            card.append(info);
        }

        // Tap vs. long-press
        let timer = null;
        let longPressed = false;
        let startX = 0;
        let startY = 0;
        card.addEventListener('pointerdown', (e) => {
            longPressed = false;
            if (!settings.longPress) return;
            startX = e.clientX;
            startY = e.clientY;
            timer = setTimeout(() => {
                longPressed = true;
                navigator.vibrate?.(15); // small buzz on phones that support it
                openMenu(item, card);
            }, 550);
        });
        card.addEventListener('pointermove', (e) => {
            if (timer && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) {
                clearTimeout(timer);
                timer = null;
            }
        });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) =>
            card.addEventListener(ev, () => {
                clearTimeout(timer);
                timer = null;
            }),
        );
        card.addEventListener('contextmenu', (e) => {
            if (!settings.longPress) return;
            e.preventDefault();
            // On phones a long-press also fires this; the timer above already opened the menu.
            if (longPressed && document.querySelector('.wf-menu')) return;
            longPressed = true;
            openMenu(item, card);
        });
        card.addEventListener('click', (e) => {
            e.stopPropagation();
            if (longPressed) {
                longPressed = false;
                return;
            }
            openItem(item, settings.tap);
        });
        return card;
    }

    // ---------- Styles (the "look" a theme can carry) ----------
    const STYLES = [
        ['classic', 'Classic'],
        ['vampire', 'Vampire'],
        ['blood', 'Blood Vampire'],
    ];

    const el = (tag, cls, text) => {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    };

    function makeTitle(style, theme) {
        const title = el('div', 'wf-title');
        if (style === 'blood') {
            // "Favorites", a thin line with a star (the star beats with Heartbeat on), then a spaced-out subtitle
            const text = { ...BLOOD_TEXT, ...(theme?.texts || {}) };
            const line = el('div', 'wf-v-divider wf-b-divider');
            line.append(el('span', 'wf-title-heart wf-b-star', '\u2726'));
            title.classList.add('wf-v-title-block');
            title.append(el('div', 'wf-v-title', 'Favorites'), line);
            if (String(text.subtitle || '').trim()) title.append(el('div', 'wf-b-subtitle', text.subtitle));
            return title;
        }
        if (style === 'vampire') {
            // ornament line, "Favorites", ornament line with a heart (the heart beats with Heartbeat on)
            const top = el('div', 'wf-v-divider wf-v-divider-top');
            top.append(el('span', 'wf-v-gem', '\u2726'), el('span', 'wf-v-fleur', '\u269C\uFE0E'), el('span', 'wf-v-gem', '\u2726'));
            const bottom = el('div', 'wf-v-divider wf-v-divider-bottom');
            bottom.append(el('span', 'wf-v-gem', '\u2726'), el('span', 'wf-title-heart wf-v-heart', '\u2665\uFE0E'), el('span', 'wf-v-gem', '\u2726'));
            title.classList.add('wf-v-title-block');
            title.append(top, el('div', 'wf-v-title', 'Favorites'), bottom);
            return title;
        }
        // ｡ ₊°༺Favorite ❤︎༻°₊ ｡  (written with escapes so it survives any file encoding)
        title.append(
            el('span', 'wf-title-deco', '\uFF61 \u208A\u00B0\u0F3A'),
            el('span', 'wf-title-word', 'Favorite '),
            el('span', 'wf-title-heart', '\u2764\uFE0E'),
            el('span', 'wf-title-deco', '\u0F3B\u00B0\u208A \uFF61'),
        );
        return title;
    }

    // Rose-gold filigree crown: fleur-de-lis center, leafy side points, lace arches, pearled band, center gem
    const CROWN_SVG = `<svg class="wf-v-crown" viewBox="0 0 64 46" aria-hidden="true">
        <path class="wf-c-fill" d="M9 34.5 Q32 31 55 34.5 L54.2 40 Q32 37 9.8 40 Z"/>
        <path class="wf-c-line" d="M9 34.5 Q32 31 55 34.5 L54.2 40 Q32 37 9.8 40 Z"/>
        <path class="wf-c-line wf-c-thin" d="M10 42.6 Q32 39.6 54 42.6"/>
        <circle class="wf-c-pearl" cx="14" cy="37" r="1"/><circle class="wf-c-pearl" cx="19" cy="36.4" r="1"/>
        <circle class="wf-c-pearl" cx="24.5" cy="36" r="1"/><circle class="wf-c-pearl" cx="39.5" cy="36" r="1"/>
        <circle class="wf-c-pearl" cx="45" cy="36.4" r="1"/><circle class="wf-c-pearl" cx="50" cy="37" r="1"/>
        <path class="wf-c-gem" d="M28.6 33.9 L35.4 33.9 L36.6 35.7 L35.4 37.5 L28.6 37.5 L27.4 35.7 Z"/>
        <path class="wf-c-line" d="M9 34 C11 27 16 25 20.5 28.5 C23.5 23.5 28 22.5 32 26.5 C36 22.5 40.5 23.5 43.5 28.5 C48 25 53 27 55 34"/>
        <path class="wf-c-line wf-c-thin" d="M11.5 33 C13 29 16.5 28 19.5 30.6 M22 30 C24.5 26.5 28.5 26 31 29 M33 29 C35.5 26 39.5 26.5 42 30 M44.5 30.6 C47.5 28 51 29 52.5 33"/>
        <path class="wf-c-line wf-c-thin" d="M14.5 33 q1.5 -2.2 3 0 M20 32.2 q1.5 -2.2 3 0 M25.5 31.7 q1.5 -2.2 3 0 M35.5 31.7 q1.5 -2.2 3 0 M41 32.2 q1.5 -2.2 3 0 M46.5 33 q1.5 -2.2 3 0"/>
        <circle class="wf-c-pearl" cx="20.5" cy="27.3" r="1.3"/><circle class="wf-c-pearl" cx="43.5" cy="27.3" r="1.3"/>
        <circle class="wf-c-pearl" cx="32" cy="25.2" r="1.3"/>
        <path class="wf-c-line" d="M9.5 34 C8.6 28 7.4 23 6 18"/>
        <path class="wf-c-line" d="M54.5 34 C55.4 28 56.6 23 58 18"/>
        <path class="wf-c-leaf" d="M6 18 C3.4 15.6 3.6 12.2 5.6 11 C6.9 13 7.8 15.4 6 18 Z"/>
        <path class="wf-c-leaf" d="M6 18 C8.2 15.4 11.2 15.2 12.4 16.8 C10.6 18.4 8.4 19.2 6 18 Z"/><path class="wf-c-leaf" d="M6 18 C3.6 16.2 0.8 16.6 0 18.4 C2 19.6 4.2 19.8 6 18 Z"/>
        <path class="wf-c-leaf" d="M58 18 C60.6 15.6 60.4 12.2 58.4 11 C57.1 13 56.2 15.4 58 18 Z"/>
        <path class="wf-c-leaf" d="M58 18 C55.8 15.4 52.8 15.2 51.6 16.8 C53.4 18.4 55.6 19.2 58 18 Z"/><path class="wf-c-leaf" d="M58 18 C60.4 16.2 63.2 16.6 64 18.4 C62 19.6 59.8 19.8 58 18 Z"/>
        <path class="wf-c-line wf-c-thin" d="M8.2 25 c-2.2 -0.2 -3 -2.2 -1.6 -3.2 M55.8 25 c2.2 -0.2 3 -2.2 1.6 -3.2"/>
        <circle class="wf-c-pearl" cx="5.6" cy="9.8" r="1.1"/><circle class="wf-c-pearl" cx="58.4" cy="9.8" r="1.1"/>
        <path class="wf-c-line wf-c-thin" d="M13 28.5 C15 21 22 18 27.5 20.5 M51 28.5 C49 21 42 18 36.5 20.5"/>
        <circle class="wf-c-pearl" cx="16.2" cy="21.8" r="0.9"/><circle class="wf-c-pearl" cx="47.8" cy="21.8" r="0.9"/>
        <path class="wf-c-line" d="M32 26 L32 17"/>
        <path class="wf-c-fill wf-c-line" d="M32 1.5 L35.2 8.6 L32 15.6 L28.8 8.6 Z"/>
        <path class="wf-c-gem-soft" d="M32 4.8 L33.6 8.6 L32 12.4 L30.4 8.6 Z"/>
        <path class="wf-c-line" d="M32 16.2 C29 17.4 25 15.8 25.4 12.6 C25.7 10.4 28.4 10.2 28.8 12.4 C29 13.6 28.2 14.3 27.4 13.9"/>
        <path class="wf-c-line" d="M32 16.2 C35 17.4 39 15.8 38.6 12.6 C38.3 10.4 35.6 10.2 35.2 12.4 C35 13.6 35.8 14.3 36.6 13.9"/>
        <path class="wf-c-fill wf-c-line" d="M29.4 17.2 L34.6 17.2 L34.6 18.8 L29.4 18.8 Z"/>
        <circle class="wf-c-pearl" cx="32" cy="21.8" r="1"/>
        </svg>`;

    // Polished silver crown: five ball-tipped points, shiny band (used by Dark Blood Vampire).
    // Each copy gets its own gradient ids so every crown renders on its own.
    let solidCrownCount = 0;
    const solidCrownSvg = () => {
        const id = `wfc${++solidCrownCount}`;
        return `<svg class="wf-v-crown wf-crown-solid" viewBox="0 0 60 40" aria-hidden="true">
        <defs>
        <linearGradient id="wfsb-${id}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" class="wf-s-dark"/><stop offset="0.22" class="wf-s-mid"/><stop offset="0.42" class="wf-s-hi"/>
        <stop offset="0.5" class="wf-s-mid"/><stop offset="0.58" class="wf-s-hi"/><stop offset="0.78" class="wf-s-mid"/><stop offset="1" class="wf-s-dark"/>
        </linearGradient>
        <linearGradient id="wfss-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity="0.28"/>
        </linearGradient>
        <linearGradient id="wfsn-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="wf-s-hi"/><stop offset="0.45" class="wf-s-dark"/><stop offset="0.75" class="wf-s-mid"/><stop offset="1" class="wf-s-dark"/>
        </linearGradient>
        <radialGradient id="wfso-${id}" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0" stop-color="#fff"/><stop offset="0.5" class="wf-s-mid"/><stop offset="1" class="wf-s-dark"/>
        </radialGradient>
        </defs>
        <path class="wf-s-body" fill="url(#wfsb-${id})" d="M9.5 31 L4.5 13.5 L13.5 24.5 L17.5 17 L22 24 L30 6.5 L38 24 L42.5 17 L46.5 24.5 L55.5 13.5 L50.5 31 Z"/>
        <path fill="url(#wfss-${id})" d="M9.5 31 L4.5 13.5 L13.5 24.5 L17.5 17 L22 24 L30 6.5 L38 24 L42.5 17 L46.5 24.5 L55.5 13.5 L50.5 31 Z"/>
        <path class="wf-s-ridge" d="M30 8.5 L30 29 M17.5 18.5 L19.5 29 M42.5 18.5 L40.5 29 M6 15.5 L11.5 29 M54 15.5 L48.5 29"/>
        <path class="wf-s-band" fill="url(#wfsn-${id})" d="M8.5 30.2 Q30 27.6 51.5 30.2 L51.5 36 Q30 33.6 8.5 36 Z"/>
        <path class="wf-s-ridge" d="M9.5 32.4 Q30 30 50.5 32.4"/>
        <circle fill="url(#wfso-${id})" class="wf-s-orb" cx="4.6" cy="12.2" r="2.5"/>
        <circle fill="url(#wfso-${id})" class="wf-s-orb" cx="17.5" cy="15.6" r="1.9"/>
        <circle fill="url(#wfso-${id})" class="wf-s-orb" cx="30" cy="5.2" r="2.7"/>
        <circle fill="url(#wfso-${id})" class="wf-s-orb" cx="42.5" cy="15.6" r="1.9"/>
        <circle fill="url(#wfso-${id})" class="wf-s-orb" cx="55.4" cy="12.2" r="2.5"/>
        <path fill="url(#wfso-${id})" class="wf-s-orb" d="M30 0.6 L31 2.6 L30 3.2 L29 2.6 Z"/>
        </svg>`;
    };

    const VAMPIRE_TEXT = {
        left: 'Same|Beautiful|Chaos',
        right: 'danger|looks better|here \u2661',
        footer: 'Favorite people|Darker conversations|A softer you',
    };

    function addVampireDecor(wrap, theme) {
        const text = { ...VAMPIRE_TEXT, ...(theme?.texts || {}) };
        const lines = (str) => String(str || '').split('|').map((t) => t.trim()).filter(Boolean);
        const block = (cls, str, heart) => {
            const box = el('div', cls);
            lines(str).forEach((line) => box.append(el('div', '', line)));
            if (heart) box.append(el('div', 'wf-v-small-heart', '\u2661'));
            return box;
        };
        if (lines(text.left).length) wrap.append(block('wf-v-corner wf-v-left', text.left, true));
        if (lines(text.right).length) wrap.append(block('wf-v-corner wf-v-right', text.right, false));
        if (lines(text.footer).length) {
            const footer = el('div', 'wf-v-footer');
            const div = el('div', 'wf-v-divider');
            div.append(el('span', 'wf-v-gem', '\u2726'), el('span', 'wf-v-heart-outline', '\u2661'), el('span', 'wf-v-gem', '\u2726'));
            footer.append(div, block('wf-v-footer-text', text.footer, false), el('div', 'wf-v-small-heart', '\u2665\uFE0E'));
            wrap.append(footer);
        }
    }

    const BLOOD_TEXT = {
        subtitle: 'The men you always come back to',
        brand: 'Noctis|People • Stories • Closer',
        topRight: 'Obsession|looks good|on you.',
        footer: 'Same chaos. Different day.',
        bottomLeft: 'Less people|Deeper connections',
        bottomRight: 'Favorites|Stay different',
    };
    const TEXT_KEYS = [...new Set([...Object.keys(VAMPIRE_TEXT), ...Object.keys(BLOOD_TEXT)])];

    function addBloodDecor(wrap, theme) {
        const text = { ...BLOOD_TEXT, ...(theme?.texts || {}) };
        const lines = (str) => String(str || '').split('|').map((t) => t.trim()).filter(Boolean);
        const block = (cls, str) => {
            const box = el('div', cls);
            lines(str).forEach((line, n) => box.append(el('div', n === 0 ? 'wf-b-first' : '', line)));
            return box;
        };
        if (lines(text.brand).length) wrap.append(block('wf-v-corner wf-b-brand', text.brand));
        if (lines(text.topRight).length) wrap.append(block('wf-v-corner wf-b-topright', text.topRight));

        const footer = el('div', 'wf-b-footer');
        if (String(text.footer || '').trim()) {
            const row = el('div', 'wf-b-footer-line');
            row.append(el('span', 'wf-b-script', text.footer));
            footer.append(row);
        }
        if (lines(text.bottomLeft).length || lines(text.bottomRight).length) {
            const corners = el('div', 'wf-b-bottom');
            corners.append(block('wf-b-bottom-left', text.bottomLeft), block('wf-b-bottom-right', text.bottomRight));
            footer.append(corners);
        }
        if (footer.childElementCount) wrap.append(footer);
    }

    function build() {
        const chat = document.getElementById('chat');
        if (!chat || chat.querySelector('.wf-wrap')) return;

        const settings = getSettings();
        if (!settings.enabled) return;

        const heading = findRecentHeading(chat);
        if (!heading) return; // welcome screen not showing

        const items = getItems(settings);
        if (!items.length) return;

        const theme = activeTheme(settings);
        const style = STYLES.some(([k]) => k === theme?.style) ? theme.style : 'classic';
        const shape = settings.shape; // every style works with every shape

        const wrap = document.createElement('div');
        wrap.className = `wf-wrap wf-shape-${shape} wf-style-${style}${style === 'blood' ? ' wf-style-vampire' : ''}`;
        wrap.classList.toggle('wf-heartbeat', settings.heartbeat);
        wrap.dataset.sig = signature(items);
        wrap._wfCleanup = [];
        const beat = BEAT_STRENGTH[settings.beatStrength];
        wrap.style.setProperty('--wf-s', SIZES[settings.size]);
        wrap.style.setProperty('--wf-beat-dur', BEAT_SPEED[settings.beatSpeed]);
        wrap.style.setProperty('--wf-beat-rest', beat.rest);
        wrap.style.setProperty('--wf-beat-peak', beat.peak);

        const title = makeTitle(style, theme);

        const row = document.createElement('div');
        row.className = 'wf-row';
        // crown look: "lace" (filigree) or "solid" (polished); Blood layout defaults to solid
        const crownStyle = ['lace', 'solid'].includes(theme?.crownStyle) ? theme.crownStyle : style === 'blood' ? 'solid' : 'lace';
        for (const item of items) row.append(makeCard(item, settings, style, crownStyle));

        // Left / right arrows — shown only when the row overflows; they loop around.
        const step = (dir) => {
            const amount = Math.max(row.clientWidth * 0.8, 100);
            const max = row.scrollWidth - row.clientWidth;
            if (dir === 'right' && row.scrollLeft >= max - 2) row.scrollTo({ left: 0, behavior: 'smooth' });
            else if (dir === 'left' && row.scrollLeft <= 2) row.scrollTo({ left: max, behavior: 'smooth' });
            else row.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
        };
        const makeArrow = (dir) => {
            const b = document.createElement('button');
            b.className = `wf-arrow wf-arrow-${dir}`;
            b.title = dir === 'left' ? 'Scroll left' : 'Scroll right';
            b.innerHTML = `<i class="fa-solid fa-chevron-${dir}"></i>`;
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                step(dir);
            });
            return b;
        };

        const scroller = document.createElement('div');
        scroller.className = 'wf-scroller';
        scroller.append(makeArrow('left'), row, makeArrow('right'));

        const refresh = () => {
            scroller.classList.toggle('wf-has-overflow', row.scrollWidth > row.clientWidth + 2);
        };
        const ro = new ResizeObserver(refresh);
        ro.observe(row);
        wrap._wfCleanup.push(() => ro.disconnect());
        row.querySelectorAll('img').forEach((img) => img.addEventListener('load', refresh));


        wrap.append(title, scroller);
        if (style === 'vampire') addVampireDecor(wrap, theme);
        if (style === 'blood') addBloodDecor(wrap, theme);

        // Nest inside the title: Favorites sits on top, "Recent Chats" text stays right under it.
        heading.prepend(wrap);
        heading.classList.add('wf-center-heading');
        // Lets the CSS push the Docs / GitHub / Discord / Temporary Chat buttons onto their own line.
        heading.parentElement?.classList.add('wf-header-has-favs');

        requestAnimationFrame(refresh);
        loadCounts(wrap, items, settings);
    }

    // Fill in chat / message counts as they arrive; re-sort once if sorting by message count.
    async function loadCounts(wrap, items, settings) {
        if (!settings.counts && !settings.messages && settings.sort !== 'messages') return;
        const missing = items.filter((x) => !cachedStats(x).loaded);
        if (!missing.length) return;
        await Promise.all(missing.map(fetchStats));
        if (!wrap.isConnected) return;
        if (settings.sort === 'messages') return rebuild();
        for (const item of items) {
            const info = wrap.querySelector(`.wf-card[data-key="${CSS.escape(item.key)}"] .wf-info`);
            if (info) info.textContent = infoText(item, settings);
        }
    }

    function teardown() {
        closeMenu();
        document.querySelectorAll('#chat .wf-wrap').forEach((w) => {
            (w._wfCleanup || []).forEach((fn) => fn());
            w.remove();
        });
        document.querySelectorAll('#chat .wf-center-heading').forEach((h) => h.classList.remove('wf-center-heading'));
        document.querySelectorAll('#chat .wf-header-has-favs').forEach((h) => h.classList.remove('wf-header-has-favs'));
    }

    function rebuild() {
        const oldRow = document.querySelector('#chat .wf-row');
        const scrollLeft = oldRow ? oldRow.scrollLeft : 0;
        teardown();
        build();
        const row = document.querySelector('#chat .wf-row');
        if (row) row.scrollLeft = scrollLeft;
    }

    // ---------- Live updates ----------
    function liveCheck() {
        const settings = getSettings();
        if (!settings.enabled || !settings.live) return;
        const chat = document.getElementById('chat');
        if (!chat || !findRecentHeading(chat)) return;
        const wrap = chat.querySelector('.wf-wrap');
        if (!wrap) return build(); // e.g. you just favorited your first bot
        if (wrap.dataset.sig !== signature(getItems(settings))) rebuild();
    }

    function hookEvents() {
        const c = ctx();
        const es = c.eventSource;
        const et = c.eventTypes || c.event_types;
        if (!es || !et) return;
        const soon = () => setTimeout(liveCheck, 300);
        ['CHARACTER_EDITED', 'CHARACTER_DELETED', 'CHARACTER_RENAMED', 'GROUP_UPDATED', 'CHAT_CREATED', 'GROUP_CHAT_CREATED']
            .filter((k) => et[k])
            .forEach((k) => es.on(et[k], soon));
    }

    // ---------- Themes ----------
    // Themes live in themes.json next to this file. Only the extension's author adds or changes them
    // (by updating the GitHub repo); users just pick one from the Theme dropdown.
    // If themes.json can't be loaded, this built-in copy of Pink Vampire is used so nothing breaks.
    const FALLBACK_THEMES = [
        {
            id: 'pink-vampire',
            name: 'Pink Vampire',
            style: 'vampire',
            colors: { accent: '#b77cf0', accent2: '#f07ac4', title: '#ecdcff', text: '#f1e6f7', border: '#6e4c80' },
        },
    ];
    const COLOR_KEYS = ['accent', 'accent2', 'title', 'text', 'border', 'crown', 'script', 'ring'];
    const OLD_THEME_IDS = { 'p:vampire': 'pink-vampire', 'blood-vampire': 'dark-blood-vampire' }; // ids used by earlier versions

    let THEMES = FALLBACK_THEMES;
    let themesLoaded = null;

    function cleanTheme(t) {
        if (!t || typeof t !== 'object' || !t.id || !t.name) return null;
        const colors = {};
        for (const k of COLOR_KEYS) {
            const v = t.colors?.[k];
            if (typeof v === 'string' && v.trim()) colors[k] = v.trim();
        }
        const texts = {};
        if (t.texts && typeof t.texts === 'object') {
            for (const k of TEXT_KEYS) if (typeof t.texts[k] === 'string') texts[k] = t.texts[k];
        }
        return {
            id: String(t.id),
            name: String(t.name),
            style: STYLES.some(([k]) => k === t.style) ? t.style : 'classic',
            crownStyle: typeof t.crownStyle === 'string' ? t.crownStyle : undefined,
            colors,
            texts,
        };
    }

    function loadThemes() {
        themesLoaded ??= (async () => {
            try {
                const url = new URL('themes.json', import.meta.url);
                const res = await fetch(url, { cache: 'no-cache' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const list = (Array.isArray(data) ? data : data.themes || []).map(cleanTheme).filter(Boolean);
                if (list.length) THEMES = list;
            } catch (e) {
                console.warn('[Welcome Favorites] Could not load themes.json, using the built-in theme.', e);
            }
        })();
        return themesLoaded;
    }

    function activeTheme(settings) {
        if (settings.theme === 'auto') return null;
        return THEMES.find((t) => t.id === settings.theme) || null;
    }

    // "Auto" leaves everything to SillyTavern's colors; a theme sets the extension's own color variables.
    function applyThemeColors(theme) {
        const root = document.documentElement.style;
        for (const k of COLOR_KEYS) {
            const v = theme?.colors?.[k];
            if (v) root.setProperty(`--wf-theme-${k}`, v);
            else root.removeProperty(`--wf-theme-${k}`);
        }
    }

    function refreshTheme() {
        applyThemeColors(activeTheme(getSettings()));
        rebuild();
    }

    // ---------- Settings panel in Extensions ----------
    const escapeHtml = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

    function addSettingsPanel() {
        const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
        if (!host) return setTimeout(addSettingsPanel, 500);
        if (document.getElementById('wf_settings')) return;

        const settings = getSettings();
        const rows = SPEC.map((item) => {
            if (item.section) return `<div class="wf-settings-section">${item.section}</div>`;
            if (item.onoff) {
                return `<div class="wf-settings-row">
                        <span class="wf-settings-label" id="wf_${item.key}_label">${item.label}</span>
                        <button type="button" class="wf-switch" role="switch" id="wf_${item.key}"
                            data-key="${item.key}" aria-labelledby="wf_${item.key}_label"><span class="wf-switch-knob"></span></button>
                    </div>`;
            }
            const opts = item.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
            return `<div class="wf-settings-row">
                        <label for="wf_${item.key}">${item.label}</label>
                        <select id="wf_${item.key}" class="text_pole" data-key="${item.key}">${opts}</select>
                    </div>`;
        }).join('');

        const themesHtml = `
            <div class="wf-settings-section">Themes</div>
            <div class="wf-settings-row">
                <label for="wf_theme">Theme</label>
                <select id="wf_theme" class="text_pole"></select>
            </div>`;

        const panel = document.createElement('div');
        panel.id = 'wf_settings';
        panel.className = 'wf-settings';
        panel.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>Welcome Favorites</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">${rows}${themesHtml}</div>
            </div>`;
        host.append(panel);

        // Switches
        panel.querySelectorAll('.wf-switch[data-key]').forEach((btn) => {
            const key = btn.dataset.key;
            btn.setAttribute('aria-checked', String(settings[key]));
            btn.addEventListener('click', () => {
                settings[key] = !settings[key];
                btn.setAttribute('aria-checked', String(settings[key]));
                saveSettings();
                syncDisabledRows(panel, settings);
                rebuild();
            });
        });

        // Dropdowns
        panel.querySelectorAll('select[data-key]').forEach((sel) => {
            const key = sel.dataset.key;
            sel.value = settings[key];
            sel.addEventListener('change', () => {
                settings[key] = sel.value;
                saveSettings();
                rebuild();
            });
        });
        syncDisabledRows(panel, settings);

        // Theme picker (list comes from themes.json)
        const themeSel = panel.querySelector('#wf_theme');
        const fillThemes = () => {
            themeSel.innerHTML =
                `<option value="auto">Auto (match SillyTavern)</option>` +
                THEMES.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
            themeSel.value = activeTheme(settings) ? settings.theme : 'auto';
        };
        fillThemes();
        loadThemes().then(fillThemes);
        themeSel.addEventListener('change', () => {
            settings.theme = themeSel.value;
            saveSettings();
            refreshTheme();
        });
    }

    // Dim the heartbeat speed/intensity rows while the heartbeat is off.
    function syncDisabledRows(panel, settings) {
        ['beatSpeed', 'beatStrength'].forEach((k) => {
            const sel = panel.querySelector(`#wf_${k}`);
            if (sel) {
                sel.disabled = !settings.heartbeat;
                sel.closest('.wf-settings-row')?.classList.toggle('wf-dim', !settings.heartbeat);
            }
        });
    }

    // ---------- Start ----------
    let queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            build();
        });
    }

    function init() {
        const chat = document.getElementById('chat');
        if (!chat) return setTimeout(init, 500);
        new MutationObserver(schedule).observe(chat, { childList: true, subtree: true });
        applyThemeColors(activeTheme(getSettings()));
        schedule();
        loadThemes().then(refreshTheme);
        hookEvents();
        setInterval(liveCheck, 2000);
    }

    init();
    addSettingsPanel();
})();
