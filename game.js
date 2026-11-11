/**
 * game.js: the Ship Names client. It draws whatever the rooms server last
 * sent (a "view") and sends the player's few actions back. All rules and all
 * timers live on the server, in arcade-rooms/games/ship-names/logic.mjs.
 *
 * Player text is only ever placed with textContent. No inline handlers.
 */
(function () {
  'use strict';

  var GAME = 'ship-names';
  var SVG = 'http://www.w3.org/2000/svg';

  // Shown as a hint in the empty name box. Originals, like the situations.
  var EXAMPLES = [
    'Technically On Schedule',
    'I Brought Snacks And Reservations',
    'Mostly Apologies From Here On',
    'Ask Me Again After Lunch',
    'This Was Not In The Brochure',
    'Arriving Eventually, With Notes',
  ];

  var app = document.getElementById('app');
  var stage = document.getElementById('stage');
  var crewBar = document.getElementById('crew');
  var roundLine = document.getElementById('round');
  var clock = document.getElementById('clock');
  var clockNum = document.getElementById('clock-num');
  var statusLine = document.getElementById('status');
  var timebar = document.getElementById('timebar');
  var announce = document.getElementById('announce');

  var room = null;      // the ArcadeRooms connection, once joined
  var last = null;      // the last { you, players, v } from the server
  var screenKey = '';   // what the stage currently shows
  var update = null;    // refreshes the current screen in place
  var joinError = '';
  var editing = false;  // changing a name already sent this round
  var draft = '';       // what is in the name box, kept across redraws
  var draftRound = -1;
  var sentName = false; // a name has gone to the server from the open name box
  var endsAt = null;    // local time the current phase ends
  var phaseTotal = 0;   // longest time seen for this phase, for the bar
  var timedKey = '';

  // ---------- small DOM helpers ----------

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function button(label, className, onClick) {
    var b = el('button', 'btn' + (className ? ' ' + className : ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  // ---------- ships ----------

  var HULLS = [
    'M4 12 L16 8 L40 10 L46 12 L40 14 L16 16 Z',
    'M5 8 H34 L44 12 L34 16 H5 Z',
    'M4 12 C10 4 30 5 46 12 C30 19 10 20 4 12 Z',
    'M3 10.5 H38 L46 12 L38 13.5 H3 Z',
  ];
  var WINGS = [
    ['M14 9 L7 2 L21 8 Z', 'M14 15 L7 22 L21 16 Z'],
    ['M10 3 H23 L25 4.5 L23 6 H10 Z', 'M10 18 H23 L25 19.5 L23 21 H10 Z'],
    ['M27 9 L22 3 L31 9 Z', 'M27 15 L22 21 L31 15 Z', 'M9 9 L5 5 L13 9 Z', 'M9 15 L5 19 L13 15 Z'],
  ];

  function svgEl(name, attrs) {
    var node = document.createElementNS(SVG, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    return node;
  }

  /**
   * A small ship, side on, flying right. The hull and wing shapes and a pale
   * tint all come from the player's seat number, so the first eight seats are
   * eight different ships.
   */
  function ship(index, width) {
    var i = Math.max(0, index | 0);
    var hull = i % HULLS.length;
    var wings = WINGS[(i + Math.floor(i / HULLS.length)) % WINGS.length];
    var tint = 'hsl(' + ((205 + i * 47) % 360) + ', 60%, 80%)';
    var svg = svgEl('svg', {
      viewBox: '0 0 48 24', width: width, height: width / 2, 'class': 'ship',
      'aria-hidden': 'true', focusable: 'false',
    });
    for (var w = 0; w < wings.length; w++) svg.appendChild(svgEl('path', { d: wings[w], fill: tint }));
    if (hull === 3) {
      svg.appendChild(svgEl('ellipse', { cx: 19, cy: 12, rx: 3.5, ry: 8.5, fill: 'none', stroke: '#f3f5fa', 'stroke-width': 1.6 }));
    }
    svg.appendChild(svgEl('path', { d: HULLS[hull], fill: '#f3f5fa' }));
    svg.appendChild(svgEl('circle', { cx: 3.5, cy: 12, r: 1.8, fill: tint }));
    return svg;
  }

  // ---------- reading a view ----------

  function seat(v, id) {
    for (var i = 0; i < v.crew.length; i++) if (v.crew[i].id === id) return v.crew[i];
    return null;
  }

  function aboard(v) {
    var n = 0;
    for (var i = 0; i < v.crew.length; i++) if (v.crew[i].connected) n++;
    return n;
  }

  function send(data) {
    if (room) room.send(data);
  }

  // ---------- the join screen ----------

  function showJoin() {
    app.setAttribute('data-screen', 'join');
    crewBar.hidden = true;
    clock.hidden = true;
    roundLine.textContent = '';
    screenKey = 'join';
    update = null;
    clear(stage);

    var form = el('form', 'hello');
    form.noValidate = true;
    var label = el('label', 'label', 'Your name');
    label.htmlFor = 'who';
    var input = el('input', 'field');
    input.id = 'who';
    input.type = 'text';
    input.maxLength = 24;
    input.autocomplete = 'nickname';
    input.setAttribute('enterkeyhint', 'go');
    input.value = window.ArcadeRooms.savedName();
    var go = el('button', 'btn', 'Come aboard');
    go.type = 'submit';
    var error = el('p', 'error', joinError);
    error.setAttribute('role', 'alert');
    error.hidden = !joinError;

    add(form,
      el('p', 'lead', 'Every ship needs a name. Preferably a long one.'),
      el('p', 'sub', 'Each round puts a ship in a situation. You name the ship. Then everyone votes.'),
      label,
      add(el('div', 'row'), input, go),
      error);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var name = input.value.replace(/\s+/g, ' ').trim();
      if (!name) {
        error.textContent = 'A name first, please. Any name will do.';
        error.hidden = false;
        input.focus();
        return;
      }
      join(name);
    });
    stage.appendChild(form);
    input.focus();
  }

  function join(name) {
    window.ArcadeRooms.saveName(name);
    joinError = '';
    remember(true);
    clear(stage);
    stage.appendChild(el('p', 'note', 'Opening a channel.'));
    screenKey = 'opening';
    var live = true;
    room = window.ArcadeRooms.connect(GAME, {
      name: name,
      onView: function (msg) {
        if (!live) return;
        last = msg;
        render();
      },
      onStatus: function (state) {
        if (!live) return;
        setStatus(state);
        if (state === 'elsewhere') {
          // Another tab took this seat. That is final: no retry, no spinner.
          live = false;
          showElsewhere();
        }
      },
      onError: function (text) {
        live = false;
        // The server turned the hello away (room full, or no usable name).
        joinError = text === 'This room is full.'
          ? 'This room is full. Eight is the most a room holds.'
          : String(text || 'Could not join.');
        if (room) room.close();
        room = null;
        last = null;
        remember(false);
        setStatus('idle');
        showJoin();
      },
    });
  }

  function showElsewhere() {
    room = null;
    last = null;
    update = null;
    screenKey = 'elsewhere';
    endsAt = null;
    drawClock();
    app.setAttribute('data-screen', 'elsewhere');
    crewBar.hidden = true;
    roundLine.textContent = '';
    clear(stage);
    var box = el('div', 'hello');
    add(box,
      el('p', 'lead', 'This game is open in another tab.'),
      el('p', 'sub', 'Carry on there. This tab has stepped aside and will not reconnect.'));
    stage.appendChild(box);
    announce.textContent = 'This game is open in another tab.';
  }

  /** So a reload in the middle of a game walks straight back in. */
  function remember(on) {
    try {
      if (on) sessionStorage.setItem('ship-names-joined', window.ArcadeRooms.room());
      else sessionStorage.removeItem('ship-names-joined');
    } catch (e) {}
  }

  function wasHere() {
    try {
      return sessionStorage.getItem('ship-names-joined') === window.ArcadeRooms.room() &&
        !!window.ArcadeRooms.savedName();
    } catch (e) {
      return false;
    }
  }

  function setStatus(state) {
    var words = {
      connecting: 'Connecting', open: 'Connected', closed: 'Connection lost',
      elsewhere: 'Open in another tab', idle: '',
    };
    statusLine.setAttribute('data-state', state);
    statusLine.textContent = words[state] || '';
  }

  // ---------- drawing a view ----------

  function keyOf(v) {
    var you = v.you || {};
    if (v.phase === 'lobby') return 'lobby';
    if (v.phase === 'write') return ['write', v.round, you.playing, you.text, editing].join('|');
    if (v.phase === 'vote') return ['vote', v.round, you.playing, you.vote].join('|');
    if (v.phase === 'reveal') return ['reveal', v.round].join('|');
    return 'final';
  }

  function render() {
    if (!last || !last.v || !last.v.crew) return;
    var v = last.v;
    if (v.round !== draftRound) {
      draftRound = v.round;
      draft = '';
      editing = false;
    }
    if (v.phase !== 'write') editing = false;
    // The name box closes once the server has answered the name it was sent
    // without a complaint.
    var mine = v.you || {};
    if (editing && sentName && !mine.problem) editing = false;
    if (!editing) sentName = false;

    var key = keyOf(v);
    if (key !== screenKey) {
      var before = screenKey.split('|').slice(0, 2).join('|');
      var after = key.split('|').slice(0, 2).join('|');
      screenKey = key;
      app.setAttribute('data-screen', v.phase);
      clear(stage);
      update = BUILD[v.phase](v);
      stage.scrollTop = 0;
      if (before !== after) announce.textContent = phaseWords(v);
      // Put the keyboard somewhere sensible: the name box if there is one,
      // otherwise the stage itself. Never a button, where an Enter still held
      // down from the last screen would press it.
      var first = stage.querySelector('[data-first]');
      (first || stage).focus({ preventScroll: true });
    }
    if (update) update(v);
    drawBar(v);
    drawCrew(v);
  }

  function phaseWords(v) {
    if (v.phase === 'lobby') return 'In the lobby.';
    if (v.phase === 'write') return 'Round ' + v.round + '. Name this ship. ' + v.situation;
    if (v.phase === 'vote') return 'Voting. Pick the best name that is not yours.';
    if (v.phase === 'reveal') return 'The reveal for round ' + v.round + '.';
    return 'The game is over. The fleet registry is open.';
  }

  function drawBar(v) {
    var words = { write: 'Naming', vote: 'Voting', reveal: 'Reveal' };
    if (v.phase === 'lobby') roundLine.textContent = window.ArcadeRooms.inDiscord() ? 'Lobby' : 'Room ' + window.ArcadeRooms.room();
    else if (v.phase === 'final') roundLine.textContent = 'Fleet registry';
    else roundLine.textContent = 'Round ' + v.round + ' of ' + v.rounds + ' · ' + words[v.phase];

    var key = v.phase + '|' + v.round;
    if (key !== timedKey) {
      timedKey = key;
      phaseTotal = 0;
    }
    if (typeof v.left === 'number') {
      endsAt = performance.now() + v.left * 1000;
      phaseTotal = Math.max(phaseTotal, v.left);
    } else {
      endsAt = null;
    }
    drawClock();
  }

  function drawClock() {
    if (endsAt === null) {
      clock.hidden = true;
      timebar.style.transform = 'scaleX(0)';
      return;
    }
    var ms = Math.max(0, endsAt - performance.now());
    var seconds = Math.ceil(ms / 1000);
    clock.hidden = false;
    clockNum.textContent = String(seconds);
    clock.setAttribute('data-low', seconds <= 10 ? 'true' : 'false');
    var part = phaseTotal > 0 ? Math.min(1, ms / (phaseTotal * 1000)) : 0;
    timebar.style.transform = 'scaleX(' + part.toFixed(3) + ')';
  }

  function drawCrew(v) {
    crewBar.hidden = false;
    clear(crewBar);
    var doneWord = { write: 'named', vote: 'voted', reveal: 'ready', final: 'again' }[v.phase] || '';
    for (var i = 0; i < v.crew.length; i++) {
      var p = v.crew[i];
      var node = el('div', 'seat' + (p.id === last.you ? ' you' : '') + (p.connected ? '' : ' away'));
      add(node, ship(p.ship, 34), el('span', 'name', p.name), el('span', 'score', p.score));
      var state = !p.connected ? 'away' : p.done ? doneWord : '';
      if (state) node.appendChild(el('span', 'state', state));
      crewBar.appendChild(node);
    }
  }

  // ---------- one builder per phase; each returns an in-place updater ----------

  var BUILD = {};

  BUILD.lobby = function () {
    var box = el('div', 'hello');
    var line = el('p', 'lead');
    var sub = el('p', 'sub', 'Five rounds. A minute to name each ship, half a minute to vote.');
    var start = button('Start the game', '', function () { send({ type: 'start' }); });
    add(box, line, sub, start);

    if (!window.ArcadeRooms.inDiscord()) {
      var invite = el('div', 'invite');
      var label = el('label', 'label', 'Invite link. Anyone who opens it joins this room.');
      label.htmlFor = 'invite-link';
      var link = el('input', 'field');
      link.id = 'invite-link';
      link.type = 'text';
      link.readOnly = true;
      link.value = window.ArcadeRooms.inviteLink();
      link.addEventListener('focus', function () { link.select(); });
      var copy = button('Copy link', 'quiet', function () {
        var done = function () {
          copy.textContent = 'Copied';
          setTimeout(function () { copy.textContent = 'Copy link'; }, 2000);
        };
        var byHand = function () {
          link.focus();
          link.select();
          try { if (document.execCommand('copy')) done(); } catch (e) {}
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link.value).then(done, byHand);
        } else {
          byHand();
        }
      });
      add(invite, label, add(el('div', 'row stack'), link, copy));
      box.appendChild(invite);
    }
    stage.appendChild(box);

    return function (v) {
      var n = aboard(v);
      line.textContent =
        n < 2 ? 'One aboard. It takes two to start.' :
        n === 2 ? 'Two aboard. That is enough to start.' :
        n + ' aboard. Ready when you are.';
      sub.textContent = n < 3
        ? 'Two can play, but three or more is better. Five rounds, a minute to name each ship.'
        : 'Five rounds. A minute to name each ship, half a minute to vote.';
      start.disabled = !v.canStart;
    };
  };

  BUILD.write = function (v) {
    var box = el('div');
    add(box, el('p', 'eyebrow', 'The situation'), el('h2', 'situation', v.situation));
    var you = v.you || {};

    if (!you.playing) {
      box.appendChild(el('p', 'note', 'You arrived mid-round. You are in from the next one.'));
    } else if (you.text && !editing) {
      var plate = el('div', 'plate');
      add(plate, el('p', 'eyebrow', 'Your ship'), el('p', 'hull', you.text));
      var change = button('Change it', 'quiet', function () {
        editing = true;
        sentName = false;
        draft = you.text;
        render();
      });
      add(box, plate, el('p', 'note', 'Waiting for the others.'), add(el('p', 'note'), change));
    } else {
      var form = el('form');
      form.noValidate = true;
      var label = el('label', 'sr-only', 'Name this ship');
      label.htmlFor = 'ship-name';
      // Two lines, so a long name can be read whole on a phone. Enter sends.
      var input = el('textarea', 'field hull');
      input.id = 'ship-name';
      input.rows = 2;
      input.maxLength = v.nameLength;
      input.autocomplete = 'off';
      input.spellcheck = true;
      input.setAttribute('enterkeyhint', 'send');
      input.setAttribute('data-first', '');
      input.setAttribute('aria-describedby', 'ship-name-count ship-name-problem');
      input.placeholder = 'Name this ship. Say, ' + EXAMPLES[v.round % EXAMPLES.length];
      input.value = draft;
      var submit = el('button', 'btn', 'Name it');
      submit.type = 'submit';
      var count = el('p', 'count');
      count.id = 'ship-name-count';
      var problem = el('p', 'error');
      problem.id = 'ship-name-problem';
      problem.setAttribute('role', 'alert');
      problem.hidden = true;
      var tally = function () {
        draft = input.value;
        count.textContent = (v.nameLength - Array.from(input.value).length) + ' characters left';
        submit.disabled = !input.value.trim();
      };
      var sendName = function () {
        var text = input.value.replace(/\s+/g, ' ').trim();
        if (!text) return;
        draft = text;
        sentName = true;
        send({ type: 'name', text: text });
      };
      input.addEventListener('input', function () {
        // A pasted line break would otherwise sit in the box unseen.
        if (/[\r\n]/.test(input.value)) input.value = input.value.replace(/[\r\n]+/g, ' ');
        tally();
      });
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && !event.isComposing) {
          event.preventDefault();
          sendName();
        }
      });
      tally();
      form.addEventListener('submit', function (event) {
        event.preventDefault();
        sendName();
      });
      add(form, label, add(el('div', 'row stack'), input, submit), count, problem);
      box.appendChild(form);
      stage.appendChild(box);
      return function (now) {
        // The server refused the last name sent. Say why, in the same place.
        var why = now.you && now.you.problem;
        var words = why === 'empty' ? 'That name came out empty. It needs at least one letter or mark that shows.'
          : why === 'long' ? 'That name is too long. ' + now.nameLength + ' characters is the limit.'
          : '';
        if (problem.textContent !== words) problem.textContent = words;
        problem.hidden = !words;
      };
    }
    stage.appendChild(box);
    return null;
  };

  BUILD.vote = function (v) {
    var box = el('div');
    var you = v.you || {};
    var voted = typeof you.vote === 'number';
    var hint = !you.playing ? 'You arrived mid-round, so you are watching this vote.'
      : voted ? 'Vote cast. Waiting for the others.'
      : 'Pick the best name. Not your own.';
    add(box, el('p', 'eyebrow', 'The situation'), el('h2', 'situation small', v.situation), el('p', 'label', hint));

    var list = el('ul', 'names' + (v.names.length < 3 ? ' single' : ''));
    v.names.forEach(function (entry) {
      var b = el('button', 'name-btn');
      b.type = 'button';
      b.appendChild(el('span', 'hull', entry.text));
      var chosen = voted && you.vote === entry.n;
      if (entry.mine) b.appendChild(el('span', 'tag', 'Yours'));
      if (chosen) b.appendChild(el('span', 'tag', 'Your vote'));
      b.setAttribute('aria-pressed', chosen ? 'true' : 'false');
      b.disabled = !you.playing || entry.mine || voted;
      b.addEventListener('click', function () { send({ type: 'vote', n: entry.n }); });
      list.appendChild(add(el('li'), b));
    });
    box.appendChild(list);
    stage.appendChild(box);
    return null;
  };

  BUILD.reveal = function (v) {
    var box = el('div');
    var lastRound = v.round >= v.rounds;
    var next = button(lastRound ? 'To the registry' : 'Next round', '', function () { send({ type: 'next' }); });
    var hint = el('p', 'note');
    add(box, add(el('div', 'head'),
      add(el('div'), el('p', 'eyebrow', 'Round ' + v.round + ' · who named what'), hint),
      next));
    box.appendChild(el('h2', 'situation small', v.situation));

    if (v.names.length === 0) {
      box.appendChild(el('p', 'note', 'Nobody named this one. The ship sails on unregistered.'));
    } else {
      if (v.names.length === 1) {
        box.appendChild(el('p', 'note', 'Only one name came in, so there was no vote and no points.'));
      }
      var sorted = v.names.slice().sort(function (a, b) { return b.votes - a.votes || a.n - b.n; });
      var list = el('ul', 'names' + (sorted.length < 3 ? ' single' : ''));
      sorted.forEach(function (entry) {
        var author = seat(v, entry.by);
        var item = el('div', 'entry' + (entry.top ? ' top' : ''));
        var meta = el('p', 'meta');
        var who = el('span', 'who');
        add(who, author ? ship(author.ship, 30) : null, el('span', '', author ? author.name : entry.name));
        meta.appendChild(who);
        meta.appendChild(el('span', '', entry.votes === 0 ? 'no votes' : plural(entry.votes, 'vote', 'votes') +
          ', +' + entry.votes));
        if (entry.voters.length) {
          var voters = el('span', 'voters');
          var names = [];
          entry.voters.forEach(function (id) {
            var voter = seat(v, id);
            if (!voter) return;
            voters.appendChild(ship(voter.ship, 22));
            names.push(voter.name);
          });
          voters.title = 'Voted for by ' + names.join(', ');
          voters.appendChild(el('span', 'sr-only', 'Voted for by ' + names.join(', ')));
          meta.appendChild(voters);
        }
        add(item, el('p', 'hull', entry.text), meta);
        if (entry.top) item.appendChild(el('p', 'why', 'Entered in the fleet registry.'));
        list.appendChild(add(el('li'), item));
      });
      box.appendChild(list);
    }
    stage.appendChild(box);

    return function (now) {
      var me = now.you || {};
      next.disabled = !!me.ready || now.waiting;
      hint.textContent = now.waiting ? 'Waiting for a second player to come back.'
        : me.ready ? 'Waiting for the others.'
        : lastRound ? 'That was the last round.'
        : 'The next round starts when everyone is ready.';
    };
  };

  BUILD.final = function (v) {
    var wrap = el('div');
    var again = button('Play again', '', function () { send({ type: 'again' }); });
    var againNote = el('p', 'note');
    add(wrap, add(el('div', 'head'),
      add(el('div'),
        el('h2', 'title', 'Fleet registry'),
        againNote),
      again));

    var cols = el('div', 'final');

    var standings = el('div');
    standings.appendChild(el('h3', 'subhead', 'Final standings'));
    var board = el('ol', 'board');
    v.crew.slice().sort(function (a, b) { return b.score - a.score || a.ship - b.ship; }).forEach(function (p) {
      var row = el('li');
      add(row, ship(p.ship, 34), el('span', 'name', p.name));
      if (v.winners.indexOf(p.id) !== -1) row.appendChild(el('span', 'tag', v.winners.length > 1 ? 'Joint first' : 'First'));
      row.appendChild(el('span', 'score', p.score));
      board.appendChild(row);
    });
    standings.appendChild(board);

    var registry = el('div');
    registry.appendChild(el('h3', 'subhead', 'Commissioned'));
    if (v.registry.length === 0) {
      registry.appendChild(el('p', 'note', 'No name won a vote. The registry stays blank, which is its own kind of record.'));
    } else {
      var list = el('ul', 'names single');
      v.registry.forEach(function (row) {
        var author = seat(v, row.by);
        var item = el('div', 'entry top');
        var meta = el('p', 'meta');
        var who = el('span', 'who');
        add(who, author ? ship(author.ship, 30) : null, el('span', '', author ? author.name : row.name));
        add(meta, who, el('span', '', 'Round ' + row.round + ', ' + plural(row.votes, 'vote', 'votes')));
        add(item, el('p', 'hull', row.text), meta, el('p', 'why', row.situation));
        list.appendChild(add(el('li'), item));
      });
      registry.appendChild(list);
    }

    add(cols, standings, registry);
    wrap.appendChild(cols);
    stage.appendChild(wrap);

    return function (now) {
      var me = seat(now, last.you);
      var asked = !!(me && me.done);
      var ask = now.again || { have: 0, need: 1 };
      again.disabled = asked;
      againNote.textContent =
        asked ? 'You asked for another game. It starts when one more player agrees.' :
        ask.have > 0 ? 'Someone has asked for another game. Press Play again to agree.' :
        ask.need > 1 ? 'The names that won their rounds. A new game takes two players asking.' :
        'The names that won their rounds, entered for good.';
    };
  };

  // ---------- go ----------

  setInterval(drawClock, 250);
  if (wasHere()) join(window.ArcadeRooms.savedName());
  else showJoin();
})();
