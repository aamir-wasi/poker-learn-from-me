/* ── poker.js ── AI Poker Coach (client-side, no dependencies) ── */

// ── Card constants ──────────────────────────────────────────────
const RANKS  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS      = ['♠','♥','♦','♣'];
const SUIT_CODES = { '♠':'s', '♥':'h', '♦':'d', '♣':'c' };
const SUIT_CLASS = { '♠':'suit-s', '♥':'suit-h', '♦':'suit-d', '♣':'suit-c' };
const SUIT_NAMES = { '♠':'Spades',  '♥':'Hearts', '♦':'Diamonds','♣':'Clubs'  };

const RANK_VAL = Object.fromEntries(RANKS.map((r,i) => [r, i+2])); // 2-14

// ── Populate rank selects ──────────────────────────────────────
function populateSelects() {
  document.querySelectorAll('.rank-select').forEach(sel => {
    RANKS.forEach(r => {
      const o = document.createElement('option');
      o.value = r; o.textContent = r === 'T' ? '10' : r;
      sel.appendChild(o);
    });
  });
}

// ── Suit pickers (button grid) ──────────────────────────────────
function initSuitPicker(picker) {
  const cls = { '♠':'s', '♥':'h', '♦':'d', '♣':'c' };
  SUITS.forEach(s => {
    const btn = document.createElement('button');
    btn.className = `suit-btn ${cls[s]}`;
    btn.textContent = s;
    btn.title = SUIT_NAMES[s];
    btn.type = 'button';
    btn.addEventListener('click', () => {
      picker.querySelectorAll('.suit-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      picker.dataset.selected = s;
    });
    picker.appendChild(btn);
  });
}

function setupSuitPickers() {
  document.querySelectorAll('.suit-picker').forEach(initSuitPicker);
}

// ── Card helpers ────────────────────────────────────────────────
function readCard(rankId, suitId) {
  const r = document.getElementById(rankId).value;
  const el = document.getElementById(suitId);
  const s = el ? (el.dataset.selected || '') : '';
  if (!r || !s) return null;
  return { rank: r, suit: s, val: RANK_VAL[r] };
}

function cardKey(c) { return c.rank + c.suit; }

function deckMinus(excluded) {
  const excSet = new Set(excluded.map(cardKey));
  const deck = [];
  for (const r of RANKS) for (const s of SUITS) {
    const c = { rank: r, suit: s, val: RANK_VAL[r] };
    if (!excSet.has(cardKey(c))) deck.push(c);
  }
  return deck;
}

// ── Hand evaluator ──────────────────────────────────────────────
// Returns { rank: 0-8, name: string, tiebreakers: number[] }
// rank 0=high card … 8=straight flush (royal = SF with ace high)
function evaluateHand(cards) {
  // cards: exactly 5
  const vals  = cards.map(c => c.val).sort((a,b) => b-a);
  const suits = cards.map(c => c.suit);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const freq = Object.entries(counts)
    .map(([v,c]) => ({ v: +v, c }))
    .sort((a,b) => b.c - a.c || b.v - a.v);

  const isFlush    = new Set(suits).size === 1;
  const sortedVals = [...vals].sort((a,b) => a-b);
  const isStraight = (() => {
    if (new Set(sortedVals).size !== 5) return false;
    if (sortedVals[4] - sortedVals[0] === 4) return true;
    // A-2-3-4-5 wheel
    if (JSON.stringify(sortedVals) === JSON.stringify([2,3,4,5,14])) return true;
    return false;
  })();
  const straightHigh = (() => {
    if (!isStraight) return 0;
    if (JSON.stringify(sortedVals) === JSON.stringify([2,3,4,5,14])) return 5;
    return sortedVals[4];
  })();

  if (isFlush && isStraight) return { rank:8, name: straightHigh===14?'Royal Flush':'Straight Flush', tiebreakers:[straightHigh] };
  if (freq[0].c===4) return { rank:7, name:'Four of a Kind',  tiebreakers:[freq[0].v, freq[1].v] };
  if (freq[0].c===3 && freq[1].c===2) return { rank:6, name:'Full House', tiebreakers:[freq[0].v, freq[1].v] };
  if (isFlush)    return { rank:5, name:'Flush',    tiebreakers: vals };
  if (isStraight) return { rank:4, name:'Straight', tiebreakers:[straightHigh] };
  if (freq[0].c===3) return { rank:3, name:'Three of a Kind', tiebreakers:[freq[0].v, ...freq.slice(1).map(f=>f.v)] };
  if (freq[0].c===2 && freq[1].c===2) return { rank:2, name:'Two Pair',  tiebreakers:[freq[0].v, freq[1].v, freq[2].v] };
  if (freq[0].c===2) return { rank:1, name:'One Pair',       tiebreakers:[freq[0].v, ...freq.slice(1).map(f=>f.v)] };
  return { rank:0, name:'High Card', tiebreakers: vals };
}

// best 5-of-7 via brute-force combinations
function bestHand(cards) {
  if (cards.length < 5) return null;
  let best = null;
  const combos = choose(cards, 5);
  for (const combo of combos) {
    const h = evaluateHand(combo);
    if (!best || compareHands(h, best) > 0) best = h;
  }
  return best;
}

function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const diff = (a.tiebreakers[i]||0) - (b.tiebreakers[i]||0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function choose(arr, k) {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...choose(rest, k-1).map(c => [first, ...c]),
    ...choose(rest, k)
  ];
}

// ── Monte Carlo equity simulation ───────────────────────────────
function monteCarloEquity(hole, board, opponents, iterations = 3000) {
  const known    = [...hole, ...board];
  const remaining = deckMinus(known);
  const boardNeeded = 5 - board.length;

  let wins = 0, ties = 0;

  for (let i = 0; i < iterations; i++) {
    // shuffle remaining deck
    const deck = shuffle([...remaining]);
    const fill  = deck.slice(0, boardNeeded);
    const fullBoard = [...board, ...fill];

    const heroHand = bestHand([...hole, ...fullBoard]);
    if (!heroHand) continue;

    let heroBeat = 0;
    let heroTied = 0;

    for (let o = 0; o < opponents; o++) {
      const oppCards = deck.slice(boardNeeded + o*2, boardNeeded + o*2 + 2);
      if (oppCards.length < 2) continue;
      const oppHand = bestHand([...oppCards, ...fullBoard]);
      if (!oppHand) continue;
      const cmp = compareHands(heroHand, oppHand);
      if (cmp > 0) heroBeat++;
      else if (cmp === 0) heroTied++;
    }

    if (heroBeat === opponents) wins++;
    else if (heroBeat + heroTied === opponents) ties += 0.5;
  }

  return (wins + ties) / iterations;
}

function shuffle(arr) {
  for (let i = arr.length-1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Board texture analysis ──────────────────────────────────────
function boardTexture(board) {
  if (board.length < 3) return { flush: false, straight: false, paired: false, desc: 'Pre-flop' };
  const suits  = board.map(c => c.suit);
  const vals   = board.map(c => c.val).sort((a,b) => a-b);
  const suitCount = {};
  for (const s of suits) suitCount[s] = (suitCount[s]||0)+1;
  const maxSuit = Math.max(...Object.values(suitCount));

  const uniqueVals = [...new Set(vals)];
  const span = uniqueVals[uniqueVals.length-1] - uniqueVals[0];
  const paired = vals.length !== uniqueVals.length;

  const flushDanger = maxSuit >= 3;
  const straightDanger = span <= 4 && uniqueVals.length >= 3;

  let parts = [];
  if (paired)         parts.push('paired board');
  if (flushDanger)    parts.push('flush draw present');
  if (straightDanger) parts.push('straight draw present');
  if (parts.length === 0) parts.push('dry / rainbow');

  return { flush: flushDanger, straight: straightDanger, paired, desc: parts.join(', ') };
}

// ── Draw detection & outs ──────────────────────────────────────
function detectDraws(hole, board) {
  if (board.length < 3) return { flushDraw:false, oesd:false, gutshot:false, outs:0, drawList:[], streetsLeft:0, hitPct:0 };
  const all   = [...hole, ...board];
  const vals  = all.map(c => c.val);
  const suits = all.map(c => c.suit);

  // Flush draw: exactly 4 of a suit (not already a flush)
  const suitCnt = {};
  for (const s of suits) suitCnt[s] = (suitCnt[s]||0)+1;
  const flushDraw = Object.values(suitCnt).some(n => n === 4);
  const flush5    = Object.values(suitCnt).some(n => n >= 5);

  // Straight draw: slide a window of 5 over sorted unique values
  const unique = [...new Set(vals)].sort((a,b)=>a-b);
  const ext    = unique.includes(14) ? [1, ...unique] : unique;
  const uSet   = new Set(ext);
  let oesd = false, gutshot = false;
  for (let lo = 1; lo <= 10; lo++) {
    const present = [];
    for (let v = lo; v <= lo+4; v++) if (uSet.has(v)) present.push(v);
    if (present.length === 4) {
      const missing = [];
      for (let v = lo; v <= lo+4; v++) if (!uSet.has(v)) missing.push(v);
      if (missing.length === 1) {
        if (missing[0] === lo || missing[0] === lo+4) oesd = true;
        else gutshot = true;
      }
    }
  }

  const streetsLeft = board.length === 3 ? 2 : board.length === 4 ? 1 : 0;
  let outs = 0;
  const drawList = [];
  if (!flush5 && flushDraw) { outs += 9; drawList.push({ name:'Flush draw', outs:9 }); }
  if (oesd)              { outs += 8; drawList.push({ name:'Open-ended straight draw', outs:8 }); }
  else if (gutshot)      { outs += 4; drawList.push({ name:'Gutshot straight draw', outs:4 }); }

  // Rule of 4 (2 streets) or Rule of 2 (1 street)
  const hitPct = streetsLeft === 2 ? Math.min(outs*4, 100) : streetsLeft === 1 ? Math.min(outs*2, 100) : 0;
  return { flushDraw: !flush5 && flushDraw, oesd, gutshot, outs, drawList, streetsLeft, hitPct };
}

// ── Pot odds ───────────────────────────────────────────────────
function potOdds(pot, betToCall) {
  if (!betToCall || betToCall <= 0) return null;
  return betToCall / (pot + betToCall);
}

// ── Pre-flop hand category ─────────────────────────────────────
function preFlopCategory(hole) {
  const [a, b] = [...hole].sort((x,y) => y.val - x.val);
  const suited = a.suit === b.suit;
  const paired = a.rank === b.rank;
  const gap    = a.val - b.val;

  if (paired) {
    if (a.val >= 10) return { tier:'premium', label:`Pocket ${a.rank}s` };
    if (a.val >= 7)  return { tier:'strong',  label:`Pocket ${a.rank}s` };
    return { tier:'speculative', label:`Pocket ${a.rank}s (small pair)` };
  }
  const isAce = a.rank === 'A';
  const isKing = a.rank === 'K';
  if (isAce && b.val >= 10) return { tier:'premium',     label:`A${b.rank}${suited?'s':'o'} (Broadway)` };
  if (isAce && b.val >= 7)  return { tier:'strong',      label:`A${b.rank}${suited?'s':'o'}` };
  if (isAce)                return { tier:'speculative', label:`A${b.rank}${suited?'s':'o'} (weak ace)` };
  if (isKing && b.val >= 10)return { tier:'strong',      label:`K${b.rank}${suited?'s':'o'}` };
  if (gap <= 1 && b.val >= 8 && suited) return { tier:'strong', label:`${a.rank}${b.rank}s (suited connector)` };
  if (gap <= 1 && b.val >= 8) return { tier:'marginal',  label:`${a.rank}${b.rank}o (connector)` };
  if (gap <= 2 && suited)   return { tier:'speculative', label:`${a.rank}${b.rank}s (suited 1-gapper)` };
  return { tier:'trash', label:`${a.rank}${b.rank}${suited?'s':'o'} (junk)` };
}

// ── Coach reasoning engine ─────────────────────────────────────
function coachAdvice({ equity, potOddsVal, texture, stage, preFlopCat, hand, draws,
                       stackSize, pot, betToCall, opponents }) {

  const winPct   = Math.round(equity * 100);
  const losePct  = 100 - winPct;
  const needPct  = potOddsVal !== null ? Math.round(potOddsVal * 100) : 0;
  const betSize  = Math.round(pot * 0.67); // suggested 2/3 pot bet
  let action = 'fold';
  const handSection   = [];
  const drawsSection  = [];
  const targetSection = [];
  const whySection    = [];

  // ─── Helper: plain hand description ───────────────────────────
  const handPlain = [
    { name:'High Card',       plain:'you have no matching cards at all. This is the weakest possible hand.' },
    { name:'One Pair',        plain:'two cards share the same number (e.g. two 8s). Decent, but many hands beat it.' },
    { name:'Two Pair',        plain:'you have two different pairs (e.g. two 8s AND two Ks). Solid hand.' },
    { name:'Three of a Kind', plain:'you have three cards of the same number. Strong — hard for opponents to guess.' },
    { name:'Straight',        plain:'five cards in a row (e.g. 4-5-6-7-8). Powerful.' },
    { name:'Flush',           plain:'five cards of the same suit (e.g. all Hearts). Very powerful.' },
    { name:'Full House',      plain:'a three-of-a-kind AND a pair together. Extremely strong.' },
    { name:'Four of a Kind',  plain:'four cards of the same number. Almost unbeatable.' },
    { name:'Straight Flush',  plain:'five in a row AND same suit. The best hand possible.' },
  ];

  // ─── PRE-FLOP ──────────────────────────────────────────────────
  if (stage === 'preflop') {
    const tier = preFlopCat.tier;

    // HAND section
    handSection.push(`You are holding <strong>${preFlopCat.label}</strong> (your two private cards) before any community cards are dealt.`);
    const tierPhrases = {
      premium:     `This is one of the <strong>best starting hands</strong> in poker (top 5%). Most of the time you will start as the favourite.`,
      strong:      `This is a <strong>good starting hand</strong> (top 15%). Worth playing confidently.`,
      marginal:    `This is an <strong>average hand</strong>. It can win, but only if the community cards help you.`,
      speculative: `This is a <strong>risky hand</strong>. It needs the community cards to improve it a lot.`,
      trash:       `This is a <strong>weak hand</strong>. Statistically, most players with stronger cards will beat you.`,
    };
    handSection.push(tierPhrases[tier]);
    handSection.push(`If the hand went to showdown right now against ${opponents} opponent${opponents>1?'s':''}, you would win roughly <strong>${winPct} times out of 100</strong>.`);

    // DRAWS section
    const suited = preFlopCat.label.includes('suited') || preFlopCat.label.match(/[A-Z][2-9TJQKAtjqka]s\b/);
    if (suited) drawsSection.push(`Your two cards share the same suit. This means if three more cards of that suit appear on the table, you could make a <strong>Flush</strong> (five matching-suit cards) — a very strong hand.`);
    if (preFlopCat.label.includes('Pocket')) {
      drawsSection.push(`You have a <strong>pair in your hand already</strong>. About 1 in 8 times, a third matching card will hit the table (called a "set") — one of the most powerful situations in poker because opponents rarely see it coming.`);
    } else {
      drawsSection.push(`Right now no community cards exist. Your chances of improvement depend on the Flop (first 3 cards). About 1 in 3 times, one of the table cards will match one of yours to give you a pair.`);
    }

    // TARGET section
    const tgtMap = {
      premium:     `Hit <strong>top pair</strong> (one table card matches your highest card) or better. If you have pocket pairs, hope for a third matching card on the table (a "set").`,
      strong:      `Hit <strong>top pair with a strong kicker</strong>, or two pair. If the flop completely misses you (no matching cards, no draw), slow down.`,
      marginal:    `You need <strong>two pair or better</strong> to continue after the flop. A single weak pair is not enough — fold to any bet if you only hit that.`,
      speculative: `You need to hit a <strong>straight, flush, or three-of-a-kind</strong>. One pair alone is not worth continuing with this hand.`,
      trash:       `You need <strong>two pair minimum</strong> after the flop, but this hand rarely gets there. Be ready to fold cheaply.`,
    };
    targetSection.push(tgtMap[tier]);

    // WHY section
    if (tier === 'premium') {
      action = 'raise';
      whySection.push(`<strong>Raise</strong> — your hand is strong, so make your opponents pay more chips to stay in the game.`);
      whySection.push(`If you just call (or check), weak hands get to see the flop cheaply and could get lucky against you. A raise forces them to either pay a higher price or leave.`);
      if (betToCall > 0) whySection.push(`Someone already bet ${betToCall}. Raise it to about ${betToCall * 3} chips to show strength and reduce opponents.`);
      else whySection.push(`Nobody has bet yet — raise to 3–4 times the Big Blind to take control of the hand.`);
    } else if (tier === 'strong') {
      action = betToCall > 0 ? 'call' : 'raise';
      if (betToCall > 0) {
        whySection.push(`<strong>Call</strong> — your hand is good enough to see the flop without over-committing chips right now.`);
        whySection.push(`You win ${winPct}% of the time at this point. Calling is profitable. See the flop, then re-evaluate based on what community cards appear.`);
      } else {
        whySection.push(`<strong>Raise</strong> — nobody has bet yet, so take the initiative with a good hand.`);
        whySection.push(`Raising puts pressure on weaker hands, limits how many people stay in, and gives you control of the hand going forward.`);
      }
    } else if (tier === 'marginal') {
      action = betToCall === 0 ? 'check' : (potOddsVal !== null && potOddsVal < 0.2 ? 'call' : 'fold');
      if (action === 'check') {
        whySection.push(`<strong>Check</strong> — no one has bet, so you see the next card for free. Never pass up a free look with a marginal hand.`);
        whySection.push(`Only continue after the flop if you hit two pair or a strong draw. A single pair is usually not enough with this starting hand.`);
      } else if (action === 'call') {
        whySection.push(`<strong>Call</strong> — the bet is small enough (only ${needPct}% of the total pot) that it's worth seeing the flop.`);
        whySection.push(`But be strict after the flop: if you don't hit strongly, fold immediately. Don't throw good chips after bad.`);
      } else {
        whySection.push(`<strong>Fold</strong> — the bet is too large (${needPct}% of the pot) for a hand this average.`);
        whySection.push(`You only win ${winPct}% of the time. Paying that much to be likely losing is a bad deal. Save your chips for a better hand.`);
      }
    } else if (tier === 'speculative') {
      action = betToCall === 0 ? 'check' : (potOddsVal !== null && potOddsVal < 0.15 ? 'call' : 'fold');
      if (action === 'call') {
        whySection.push(`<strong>Call</strong> — the price is cheap enough to take a shot at hitting a big hand on the flop.`);
        whySection.push(`If the flop doesn't give you at least a strong draw or three-of-a-kind, fold immediately. Don't chase.`);
      } else if (action === 'fold') {
        whySection.push(`<strong>Fold</strong> — this hand needs to hit big, but you're being asked to pay too much for that small chance.`);
        whySection.push(`The math doesn't add up: you only win ${winPct}% of the time, but the bet is ${needPct}% of what you'd win. That's a losing trade long-term.`);
      } else {
        whySection.push(`<strong>Check</strong> — free look! Take it. If the flop gives you a straight draw, flush draw, or set → continue. Otherwise fold.`);
      }
    } else {
      action = betToCall === 0 ? 'check' : 'fold';
      if (action === 'fold') {
        whySection.push(`<strong>Fold</strong> — this hand wins only ${winPct}% of the time, which means you lose ${losePct}% of the time. Paying chips to likely lose is a bad strategy.`);
        whySection.push(`The best players fold weak hands quickly. Saving chips now means you have more when a strong hand arrives.`);
      } else {
        whySection.push(`<strong>Check</strong> — no one is charging you to see the next card, so take the free look. If the flop doesn't help you significantly, fold to any bet.`);
      }
    }
    if (opponents > 1) whySection.push(`👥 <strong>Note:</strong> With ${opponents} opponents, more people can have strong cards. Be more selective about continuing.`);
    return { action, handSection, drawsSection, targetSection, whySection };
  }

  // ─── POST-FLOP ─────────────────────────────────────────────────
  const handRank = hand ? hand.rank : -1;
  const handName = hand ? hand.name : 'High Card';
  const handInfo = handPlain[Math.max(0, handRank)];
  const required2 = potOddsVal !== null ? potOddsVal : 0;

  // HAND section
  handSection.push(`You currently have a <strong>${handName}</strong> — meaning ${handInfo.plain}`);
  handSection.push(`This is the <strong>${stage.toUpperCase()}</strong> (${stage === 'flop' ? '3 community cards' : stage === 'turn' ? '4th community card just dealt' : 'final 5th card dealt'}).`);
  handSection.push(`Right now you would win <strong>${winPct} out of 100 times</strong> against ${opponents} opponent${opponents>1?'s':''}.${winPct >= 65 ? ' That is a strong lead.' : winPct >= 45 ? ' That is a close game.' : ' You are behind — be careful.'}`);

  // DRAWS section
  if (draws.drawList.length > 0) {
    draws.drawList.forEach(d => {
      const pct = draws.streetsLeft === 2 ? d.outs * 4 : draws.streetsLeft === 1 ? d.outs * 2 : 0;
      const drawExplain = d.name === 'Flush draw'
        ? `You have 4 cards of the same suit — you need one more to complete a Flush. There are <strong>${d.outs} cards</strong> in the remaining deck that can give it to you.`
        : d.name === 'Open-ended straight draw'
        ? `You have 4 cards in a row — you need one card at either end to complete a Straight. There are <strong>${d.outs} cards</strong> in the deck that finish it.`
        : `You have 4 cards almost in a row with one gap — you need one specific card to complete a Straight. There are <strong>${d.outs} cards</strong> that work.`;
      drawsSection.push(`${drawExplain} With ${draws.streetsLeft} card${draws.streetsLeft>1?'s':''} still to come, you have roughly a <strong>${pct}% chance</strong> of completing it.`);
    });
    if (draws.streetsLeft === 0) drawsSection.push(`⚠️ No more cards are coming. Your draw didn't complete — you must win or fold with your current hand only.`);
  } else if (handRank >= 3) {
    drawsSection.push(`Your hand is already strong (${handName}). You don't need to improve — focus on getting more chips into the pot while you are ahead.`);
  } else {
    drawsSection.push(`You don't have any draw working right now. Your hand is unlikely to get better on the next card(s).`);
    if (draws.streetsLeft > 0) drawsSection.push(`There ${draws.streetsLeft === 1 ? 'is 1 card' : 'are 2 cards'} still to come, but without outs (cards that help you), the odds of improving are very low.`);
  }

  // TARGET section
  const tgtPost = [
    `You need the next community card to match one of your hole cards to make a pair. Without that, this hand will very likely lose.`,
    `You currently have one pair. To improve, look for: another matching card to give you <strong>two pair</strong>, or a third matching card for <strong>three of a kind</strong>.`,
    `You have two pair. If the board gets a third of any of your pairs, you'd make a <strong>Full House</strong> — an extremely strong hand.`,
    `Three of a kind — already very strong. If a pair appears on the board, you'd upgrade to a <strong>Full House</strong>. But even without it, you are likely ahead.`,
    `You have a Straight — strong. Just watch out: if 3+ cards of the same suit are on the board, an opponent might have a Flush that beats you.`,
    `You have a Flush — very strong. Only a Full House or Four of a Kind can beat you. Get more chips in the pot.`,
    `Full House — extremely strong. Only Four of a Kind can beat you. Try to get all the chips in.`,
    `Four of a Kind — virtually unbeatable. Try to get all chips into the pot, possibly by letting the opponent bet first.`,
    `You have the best possible hand. You cannot lose. Get as many chips as possible into the pot.`,
  ];
  targetSection.push(tgtPost[Math.max(0, handRank)]);
  if (draws.oesd)      targetSection.push(`For your Straight: you need a card at either end of your sequence. <strong>8 cards</strong> in the deck complete it.`);
  if (draws.flushDraw) targetSection.push(`For your Flush: you need one more card of the same suit. <strong>9 cards</strong> in the deck complete it.`);
  if (draws.gutshot)   targetSection.push(`For your Straight (gutshot): you need one specific middle card. Only <strong>4 cards</strong> in the deck work — this is a slim chance.`);

  // WHY section — direct, plain action explanation
  if (handRank >= 5 || equity > 0.65) {
    action = 'raise';
    whySection.push(`<strong>Raise</strong> — you have a strong hand and are winning ${winPct}% of the time. Make your opponents pay more to stay in.`);
    whySection.push(`Bet around <strong>${betSize} chips</strong> (about ⅔ of the pot). This does two things: (1) forces anyone chasing a Flush or Straight to pay a high price to see the next card, and (2) grows the pot while you are ahead.`);
    if (texture.flush || texture.straight) whySection.push(`⚠️ The board has potential draws on it. Raise NOW — every free card you give away is a risk that an opponent hits a lucky hand to beat you.`);
  } else if (handRank >= 3 || (equity > required2 + 0.05 && equity > 0.5)) {
    action = betToCall > 0 ? 'call' : 'raise';
    if (betToCall > 0) {
      whySection.push(`<strong>Call</strong> — you are ahead (${winPct}% to win) and the bet is worth paying.`);
      whySection.push(`Simple math: you are adding <strong>${betToCall}</strong> chips to win a pot of <strong>${pot + betToCall}</strong>. You need to win more than ${needPct}% of the time to profit — and you are winning ${winPct}%. It's a good call.`);
    } else {
      whySection.push(`<strong>Raise</strong> — nobody bet, but your hand is strong. Don't give free cards to people who might be chasing draws.`);
      whySection.push(`Bet around <strong>${betSize} chips</strong>. If someone is trying to complete a Flush or Straight, make them pay for that chance.`);
    }
  } else if (equity > required2 && handRank >= 1) {
    action = betToCall > 0 ? 'call' : 'check';
    if (betToCall > 0) {
      whySection.push(`<strong>Call</strong> — it's a close decision, but the math slightly favours continuing.`);
      whySection.push(`You need to win ${needPct}% of the time to break even on this call — you're at ${winPct}%. That's thin, but positive.${draws.outs > 0 ? ` Plus you have ${draws.outs} cards that can improve your hand (~${draws.hitPct}% chance).` : ''}`);
      whySection.push(`Be careful on the next street: if the card that comes looks dangerous (completes a flush or straight) and your opponent bets big, lean towards folding.`);
    } else {
      whySection.push(`<strong>Check</strong> — your hand is only average right now. No one bet, so take the free card.`);
      whySection.push(`Don't bet with a medium hand unless you have a reason. Betting and getting called or raised with a mediocre hand puts you in an uncomfortable spot.${draws.outs > 0 ? ` You have ${draws.outs} outs — take the free card and hope to improve.` : ''}`);
    }
  } else {
    action = betToCall > 0 ? 'fold' : 'check';
    if (betToCall > 0) {
      whySection.push(`<strong>Fold</strong> — you need to win at least ${needPct}% of the time to make this call worthwhile, but you're only winning ${winPct}% of the time.`);
      whySection.push(`You are <strong>${needPct - winPct}% short</strong>. That gap means every time you make this call, you lose money on average. The right move is to fold and protect your remaining chips.`);
      if (draws.outs === 0) whySection.push(`You also have no cards left in the deck that can improve your hand, so there's nothing to chase. Fold confidently.`);
      else whySection.push(`Even with ${draws.outs} cards that could improve you (~${draws.hitPct}% chance), the combined odds still don't justify the call.`);
    } else {
      whySection.push(`<strong>Check</strong> — your hand is weak, but checking costs nothing. Never fold when you can see the next card for free.`);
      whySection.push(`${draws.outs > 0 ? `You have ${draws.outs} cards that could improve your hand (~${draws.hitPct}% chance). Take the free card.` : `Hope the next card helps you — but if the opponent bets big afterwards, you'll likely need to fold.`}`);
    }
  }

  // Board texture — plain language warnings
  if (texture.flush)    whySection.push(`🌊 <strong>Suit warning:</strong> three or more cards of the same suit are on the table. This means an opponent could already have a Flush (all same-suit cards) — a very strong hand. If someone bets big, think carefully before calling.`);
  if (texture.straight) whySection.push(`↔️ <strong>Sequence warning:</strong> the board cards are close in number (like 7-8-9). An opponent could be completing a Straight. Don't over-invest with just a pair.`);
  if (texture.paired)   whySection.push(`👥 <strong>Pair on board:</strong> one of the table cards has a pair. That means an opponent holding a matching card now has Three of a Kind or a Full House — hands that beat a simple pair or two pair.`);

  // Pot odds plain summary
  if (potOddsVal !== null) whySection.push(`📊 <strong>The maths:</strong> You must add ${betToCall} chips to a pot of ${pot}. To break even long-term, you need to win at least ${needPct}% of the time. Your current chance: ${winPct}%. ${winPct >= needPct ? '✅ Call is profitable.' : '❌ Call loses money over time.'}`);

  // SPR plain language
  if (stackSize && pot) {
    const spr = (stackSize / pot).toFixed(1);
    if (+spr < 2)  whySection.push(`💰 <strong>Low stack warning:</strong> you only have about ${spr}× the pot left. At this point folding equity away is very costly — if your hand has any strength, commit to it.`);
    if (+spr > 10) whySection.push(`💰 <strong>Deep stacks:</strong> you have lots of chips (${spr}× the pot). Drawing hands become more valuable because if you hit, you can win a huge pot.`);
  }

  return { action, handSection, drawsSection, targetSection, whySection };
}

// ── UI: render card visual ──────────────────────────────────────
function renderCards(hole, board) {
  const display = document.getElementById('card-display');
  display.innerHTML = '';

  const render = (card, cls) => {
    const el = document.createElement('div');
    el.className = `card-viz ${cls} ${SUIT_CLASS[card.suit]}`;
    const rankLabel = card.rank === 'T' ? '10' : card.rank;
    el.innerHTML = `
      <div class="corner">${rankLabel}<br>${card.suit}</div>
      <div class="center">${card.suit}<br><span class="suit-name">${SUIT_NAMES[card.suit]}</span></div>
      <div class="corner bottom">${rankLabel}<br>${card.suit}</div>
    `;
    display.appendChild(el);
  };

  hole.forEach(c => render(c, 'hole'));
  board.forEach(c => render(c, 'board'));
}

// ── Street Betting Tracker ──────────────────────────────────────
const SBT = { pot: 0, committed: {}, blinds: {}, street: null };

function sbtMax() {
  // Only consider non-folded players when determining the current bet price
  const v = BT.players
    .map((p, i) => p.folded ? -1 : (SBT.committed[i] ?? -1))
    .filter(n => n >= 0);
  return v.length ? Math.max(0, ...v) : 0;
}

function initSBT(street, startPot) {
  SBT.street = street;

  // startPot (from the pot-size input / pfwFinish) is the authoritative total pot —
  // it already includes SB + BB + every caller. Use PFW.pot only as last resort.
  SBT.pot = startPot > 0 ? startPot : (PFW.pot || 0);

  // Fresh street — pre-flop blind amounts ARE the opening committed chips.
  // They set the price everyone must call to continue (e.g. if BB raised to 50,
  // everyone needs to call 50; SB has already put in 5 so they owe 45 more).
  SBT.committed = {};
  SBT.blinds    = {};   // kept for the display tag only

  const sbIdx0 = BT.players.findIndex(p => p.sb);
  const bbIdx0 = BT.players.findIndex(p => p.bb);
  const bbAmt  = PFW.bbPosted > 0 ? PFW.bbPosted : PFW.bbMinAmt;

  BT.players.forEach((p, i) => {
    if (p.folded) return;          // folded pre-flop — skip
    if (i === sbIdx0 && PFW.sbAmt > 0) {
      SBT.committed[i] = PFW.sbAmt;
      SBT.blinds[i]    = PFW.sbAmt;
    } else if (i === bbIdx0 && bbAmt > 0) {
      SBT.committed[i] = bbAmt;
      SBT.blinds[i]    = bbAmt;
    } else {
      SBT.committed[i] = 0;        // everyone else starts at 0 this street
    }
  });

  // Auto-update the Opponents Left input right away
  const activeOpp = BT.players.filter((p, i) => i !== 0 && !p.folded).length;
  const oppEl = document.getElementById('opponents');
  if (oppEl) oppEl.value = Math.max(1, activeOpp);

  const t = document.getElementById('sbt-title');
  if (t) {
    const potNote = SBT.pot > 0
      ? ` <span class="sbt-pot-note">(pot: ${SBT.pot} chips carried in)</span>` : '';
    t.innerHTML = `💰 ${street[0].toUpperCase() + street.slice(1)} Betting Round${potNote}`;
  }
  document.getElementById('sbt-ai-rec')?.classList.add('hidden');
  renderSBT();
  document.getElementById('sbt-section')?.classList.remove('hidden');
}

function renderSBT() {
  const rows   = document.getElementById('sbt-rows');
  const totals = document.getElementById('sbt-totals');
  if (!rows) return;
  const max = sbtMax();

  // Save any amounts already typed but not yet submitted (so fold doesn't wipe them)
  const savedTyped = {};
  rows.querySelectorAll('[id^="sbt-i"]').forEach(inp => {
    const idx = parseInt(inp.id.replace('sbt-i', ''));
    if (inp.value) savedTyped[idx] = inp.value;
  });

  // Post-flop: SB acts first, then clockwise
  const n = BT.players.length;
  const bbIdx = BT.players.findIndex(p => p.bb);
  const sbIdx = BT.players.findIndex(p => p.sb);
  const startIdx = sbIdx >= 0 ? sbIdx : (bbIdx >= 0 ? (bbIdx + 1) % n : 0);
  const order = Array.from({ length: n }, (_, k) => (startIdx + k) % n);

  rows.innerHTML = order.map(i => {
    const p       = BT.players[i];
    const isYou   = i === 0;
    const put     = SBT.committed[i] ?? 0;
    const blind   = SBT.blinds[i] ?? 0;
    const roleTag = i === sbIdx
      ? ` <span class="sbt-role sb-role-tag">SB</span>`
      : i === bbIdx
      ? ` <span class="sbt-role bb-role-tag">BB</span>`
      : '';
    const blindTag = blind > 0
      ? ` <span class="sbt-put sbt-blind-tag">pre-flop blind: ${blind}</span>` : '';
    const putTag   = put > 0
      ? ` <span class="sbt-put">bet: ${put}</span>` : '';

    if (p.folded) {
      return `<div class="sbt-row sbt-row-folded">
        <span class="sbt-pname">🚭 <strong>${p.name}</strong>${roleTag}${blindTag}${putTag}</span>
        <span class="sbt-fold-badge">✘ FOLDED</span>
      </div>`;
    }

    const callAmt = Math.max(0, max - put);
    const ccLbl   = max === 0 ? '✓ Check' : `Call ${callAmt}`;
    const bLbl    = max === 0 ? 'Bet' : 'Raise to';
    return `<div class="sbt-row${isYou ? ' sbt-you' : ''}">
      <span class="sbt-pname">${isYou ? '🧑' : '👤'} <strong>${p.name}</strong>${roleTag}${blindTag}${putTag}</span>
      <div class="sbt-acts">
        <button type="button" class="sbt-btn sbt-cc" data-idx="${i}">${ccLbl}</button>
        <div class="sbt-bgrp">
          <button type="button" class="sbt-btn sbt-bb" data-idx="${i}">${bLbl}</button>
          <input type="text" inputmode="numeric" pattern="[0-9]*" class="sbt-inp" id="sbt-i${i}" placeholder="${max > 0 ? max + 1 : 'e.g. 20'}">
        </div>
        <button type="button" class="sbt-btn sbt-ff" data-idx="${i}">✗ Fold</button>
      </div>
    </div>`;
  }).join('');

  // Restore typed values that haven't been submitted yet
  Object.entries(savedTyped).forEach(([idx, val]) => {
    const inp = document.getElementById(`sbt-i${idx}`);
    if (inp) inp.value = val;
  });

  rows.querySelectorAll('.sbt-cc').forEach(b => b.addEventListener('click', () => {
    SBT.committed[+b.dataset.idx] = sbtMax(); renderSBT();
  }));
  rows.querySelectorAll('.sbt-bb').forEach(b => b.addEventListener('click', () => {
    const idx = +b.dataset.idx;
    const amt = parseInt(document.getElementById(`sbt-i${idx}`)?.value);
    if (!amt || amt < 1) { document.getElementById(`sbt-i${idx}`)?.focus(); return; }
    SBT.committed[idx] = amt; renderSBT();
  }));
  rows.querySelectorAll('.sbt-ff').forEach(b => b.addEventListener('click', () => {
    const idx = +b.dataset.idx;
    BT.players[idx].folded = true;
    // Chips they already committed this street stay in the pot (they don't get them back)
    // Update opponents count immediately so Analyzer stays in sync
    const activeOpp = BT.players.filter((p, i) => i !== 0 && !p.folded).length;
    const oppEl = document.getElementById('opponents');
    if (oppEl) oppEl.value = Math.max(1, activeOpp);
    renderBlindTracker();
    renderSBT();
  }));

  // Totals: include committed chips from folded players (they don't get them back)
  const strTotal = Object.values(SBT.committed).reduce((a, b) => a + b, 0);
  const totalPot = SBT.pot + strTotal;
  const yourCall = Math.max(0, sbtMax() - (SBT.committed[0] ?? 0));
  if (totals) totals.innerHTML =
    `<span class="sbt-tpot">🪙 Total pot: <strong>${totalPot}</strong></span>` +
    `<span class="sbt-tcall${yourCall > 0 ? ' urgent' : ''}">🧑 Your call to continue: ` +
    `<strong>${yourCall > 0 ? yourCall + ' chips' : 'FREE — you can check!'}</strong></span>`;
}

function sbtApply() {
  const strTotal = Object.values(SBT.committed).reduce((a, b) => a + b, 0);
  const totalPot = SBT.pot + strTotal;
  const yourCall = Math.max(0, sbtMax() - (SBT.committed[0] ?? 0));
  const opp      = BT.players.filter((p, i) => i !== 0 && !p.folded).length;
  document.getElementById('pot-size').value    = totalPot;
  document.getElementById('bet-to-call').value = yourCall;
  document.getElementById('opponents').value   = Math.max(1, opp);
  const ctx = document.querySelector('.bet-context');
  if (ctx) { ctx.classList.add('sbt-applied'); setTimeout(() => ctx.classList.remove('sbt-applied'), 600); }
  document.getElementById('analyze-btn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function sbtAdvice() {
  const el = document.getElementById('sbt-ai-rec');
  if (!el) return;

  const h1 = readCard('hole1-rank', 'hole1-suit');
  const h2 = readCard('hole2-rank', 'hole2-suit');
  if (!h1 || !h2) {
    el.innerHTML = `<div class="pfw-ai-note">📋 Enter your hole cards in the Card Input section above, then tap this button.</div>`;
    el.classList.remove('hidden');
    return;
  }

  const board = [
    readCard('board0-rank','board0-suit'), readCard('board1-rank','board1-suit'),
    readCard('board2-rank','board2-suit'), readCard('board3-rank','board3-suit'),
    readCard('board4-rank','board4-suit'),
  ].filter(Boolean);

  if (board.length < 3) {
    el.innerHTML = `<div class="pfw-ai-note">📋 Enter at least the 3 flop cards to get post-flop advice.</div>`;
    el.classList.remove('hidden');
    return;
  }

  // ── Card labels
  const ss = { s:'♠', h:'♥', d:'♦', c:'♣' };
  const cStr    = c => `${c.rank}${ss[c.suit]||c.suit}`;
  const holeStr = `${cStr(h1)} ${cStr(h2)}`;
  const boardStr = board.map(cStr).join(' ');

  // ── Table state
  const activePlayers = BT.players.filter((p, i) => i !== 0 && !p.folded);
  const opponents     = Math.max(1, activePlayers.length);
  const foldedCount   = BT.players.filter((p, i) => i !== 0 && p.folded).length;
  const max           = sbtMax();
  const yourCommitted = SBT.committed[0] ?? 0;
  const callAmt       = Math.max(0, max - yourCommitted);
  const streetTotal   = Object.values(SBT.committed).reduce((a, b) => a + b, 0);
  const totalPot      = SBT.pot + streetTotal;
  const potIfCall     = totalPot + callAmt;

  // Who bet/raised?
  const raisers = BT.players
    .map((p, i) => ({ p, i, amt: SBT.committed[i] ?? 0 }))
    .filter(({ i, amt }) => i !== 0 && !BT.players[i].folded && amt === max && max > 0);
  const raiserName = raisers.length ? raisers[0].p.name : null;
  const bigRaise   = raiserName && callAmt > totalPot * 0.4;

  // ── REAL Monte Carlo equity (same engine as Analyze Hand)
  const equity  = monteCarloEquity([h1, h2], board, opponents, 2000);
  const winPct  = Math.round(equity * 100);
  const needPct = callAmt > 0 ? Math.round(callAmt / potIfCall * 100) : 0;
  const edgePct = winPct - needPct;

  // ── Hand evaluation
  const bh       = bestHand([h1, h2, ...board]);
  const handRank = bh ? bh.rank : -1;
  const handName = bh ? bh.name : 'High Card';

  // Plain-English explanation of what the hand means
  const handExplain = {
    'High Card':        `neither of your cards (${holeStr}) paired with the board [${boardStr}] — you have absolutely nothing made`,
    'One Pair':         `one of your cards paired with the board`,
    'Two Pair':         `you have two different pairs`,
    'Three of a Kind':  `you have three of a kind`,
    'Straight':         `you have a straight (five consecutive ranks)`,
    'Flush':            `you have a flush (five cards of the same suit)`,
    'Full House':       `you have a full house`,
    'Four of a Kind':   `you have four of a kind`,
    'Straight Flush':   `you have a straight flush`,
  };
  const explain = handExplain[handName] || `you have ${handName}`;

  // ── Draws
  const draws    = detectDraws([h1, h2], board);
  const texture  = boardTexture(board);
  const streetName = board.length === 3 ? 'Flop' : board.length === 4 ? 'Turn' : 'River';
  const streetsLeft = board.length === 3 ? 2 : board.length === 4 ? 1 : 0;

  // Draw description
  let drawLine = '';
  if (draws.drawList.length) {
    drawLine = `You have a <strong>${draws.drawList.map(d=>d.name).join(' + ')}</strong> — ${draws.outs} outs, approximately <strong>${draws.hitPct}%</strong> chance to complete it by the ${streetsLeft===2?'river':'river'}.`;
  }

  // What cards would help them?
  let improveHint = '';
  if (handRank <= 1 && !draws.outs) {
    const ranks = [...new Set([h1.rank, h2.rank])];
    improveHint = `To even get One Pair you'd need a <strong>${ranks.join(' or ')}</strong> to fall on the ${streetsLeft===2?'turn or river':'river'} — roughly a 12–18% chance.`;
  }

  // ── Table context note
  const ctxParts = [];
  if (foldedCount)   ctxParts.push(`${foldedCount} player${foldedCount>1?'s':''} folded`);
  if (raiserName)    ctxParts.push(`<strong>${raiserName}</strong> bet <strong>${max}</strong> chips into a <strong>${totalPot}</strong> chip pot`);
  if (opponents===1) ctxParts.push(`you're heads-up — aggression matters more now`);
  if (texture.flush && handRank < 5)  ctxParts.push(`board has flush danger`);
  if (texture.straight && handRank < 4) ctxParts.push(`board has straight danger`);
  const ctxLine = ctxParts.length
    ? `<div class="sbt-ctx-note">👥 ${ctxParts.join(' · ')}.</div>` : '';

  // ── Classification
  const isNuts  = handRank >= 5;  // Flush+
  const isMade  = handRank >= 2;  // Two Pair+
  const isWeak  = handRank <= 1;  // High Card or One Pair
  const drawGood = draws.outs >= 8 && callAmt <= totalPot * 0.4;
  const drawWeak = draws.outs > 0 && draws.outs < 8 && callAmt > totalPot * 0.25;

  let verdict, title, body, cls;

  if (callAmt === 0) {
    // ── Nobody bet this street ──
    if (isNuts || handRank >= 4) {
      verdict = 'BET'; cls = 'pfw-ai-gold';
      const bet = Math.max(10, Math.round(totalPot * 0.65));
      title = `🚀 Bet <strong>${bet}</strong> chips — you have ${handName}, punish them now`;
      body  = `Your cards: <strong>${holeStr}</strong> → <strong>${handName}</strong> on [${boardStr}]. `
            + `You win <strong>${winPct}%</strong> of simulated runouts against ${opponents} opponent${opponents>1?'s':''}. `
            + `This is one of the strongest hands you can make. Do NOT check here — every free card is a chance for someone to outdraw you. `
            + `Bet <strong>${bet}</strong> chips (65% of pot). If someone re-raises, re-raise back — you likely have the best hand.`;
    } else if (isMade) {
      verdict = 'BET'; cls = 'pfw-ai-gold';
      const bet = Math.max(10, Math.round(totalPot * 0.5));
      title = `🚀 Bet <strong>${bet}</strong> chips — ${handName} is strong, don't give free cards`;
      body  = `Your cards: <strong>${holeStr}</strong> → <strong>${handName}</strong> on [${boardStr}]. `
            + `Win rate: <strong>${winPct}%</strong>. You have a genuine made hand. `
            + `Betting <strong>${bet}</strong> chips (half-pot) does two things: it builds the pot when you're winning, and it forces anyone on a draw to pay for the privilege. `
            + (texture.flush ? `⚠️ The board shows flush danger — bet now before the flush card lands.` : `If called, re-evaluate on the next card.`);
    } else if (drawGood || draws.outs >= 8) {
      verdict = 'CHECK'; cls = 'pfw-ai-blue';
      title = `✓ Check — take the free card, you have a strong draw`;
      body  = `Your cards: <strong>${holeStr}</strong> on [${boardStr}] → currently only <strong>${handName}</strong> (${winPct}% win rate). `
            + (drawLine ? drawLine + ' ' : '')
            + `Check here to see the next card for free. If someone bets, the pot odds likely justify calling — but only for this draw. If you miss, don't chase further.`;
    } else {
      // Weak hand, no draw, nobody bet
      verdict = 'CHECK'; cls = 'pfw-ai-blue';
      title = `✓ Check — weak hand, protect your chips`;
      body  = `Your cards: <strong>${holeStr}</strong> on [${boardStr}]: ${explain}. `
            + `Reality check: you only win <strong>${winPct}%</strong> of simulated runouts against ${opponents} opponent${opponents>1?'s':''}. `
            + `That means ${100-winPct}% of the time you lose. Checking costs you nothing right now. `
            + (improveHint ? improveHint + ' ' : '')
            + `<strong>Key rule:</strong> If ANYONE bets after you check — FOLD. Do not call a bet with this hand. Champions fold weak hands quickly; it's how they protect their stack for the hands that matter.`;
    }
  } else {
    // ── Someone bet/raised ──
    if (isNuts) {
      verdict = 'RAISE'; cls = 'pfw-ai-gold';
      const reraise = Math.round(max * 2.8);
      title = `🚀 Raise to <strong>${reraise}</strong> — ${handName}, you're the favourite`;
      body  = `Your cards: <strong>${holeStr}</strong> → <strong>${handName}</strong> on [${boardStr}]. `
            + `Win rate: <strong>${winPct}%</strong>. ${raiserName||'Someone'} bet ${max} — they walked into your trap. `
            + `Re-raise to <strong>${reraise}</strong> chips. Slow-playing a hand this strong is the #1 mistake beginners make — it costs you value every single time. `
            + `Even if they fold, winning the pot now is the right result.`;
    } else if (isMade && edgePct >= 15) {
      verdict = 'CALL'; cls = 'pfw-ai-blue';
      title = `✅ Call <strong>${callAmt}</strong> — ${handName} has a clear +${edgePct}% edge`;
      body  = `Your cards: <strong>${holeStr}</strong> → <strong>${handName}</strong> on [${boardStr}]. `
            + `Win rate: <strong>${winPct}%</strong>. Break-even: <strong>${needPct}%</strong>. `
            + `You're <strong>+${edgePct}%</strong> above break-even — calling <strong>${callAmt}</strong> is clearly profitable over time. `
            + (bigRaise ? `Note: ${raiserName} is betting big. Consider whether they have a draw or are bluffing.` : `After calling, reassess on the next card before committing more.`);
    } else if (isMade && edgePct >= 5) {
      verdict = 'CALL'; cls = 'pfw-ai-caution';
      title = `⚠️ Thin call of <strong>${callAmt}</strong> — ${handName}, small +${edgePct}% edge`;
      body  = `Your cards: <strong>${holeStr}</strong> → <strong>${handName}</strong>. Win rate <strong>${winPct}%</strong>, break-even <strong>${needPct}%</strong>. `
            + `The edge is real but slim. Call <strong>${callAmt}</strong> only if it won't cripple your stack. `
            + (bigRaise ? `<strong>${raiserName}</strong> bet big — a big bet often means a big hand. Be ready to fold if the next card hurts you.` : `Don't call any further raises unless you improve.`);
    } else if (drawGood) {
      verdict = 'CALL'; cls = 'pfw-ai-caution';
      title = `⚠️ Call <strong>${callAmt}</strong> for the draw — but ONLY this once`;
      body  = `Your cards: <strong>${holeStr}</strong> on [${boardStr}] = <strong>${handName}</strong> (${winPct}% right now). `
            + (drawLine ? drawLine + ' ' : '')
            + `Pot odds (${needPct}% to break even) justify calling <strong>${callAmt}</strong> to try to hit. `
            + `<strong>Critical rule:</strong> If you miss on the next card — FOLD immediately to any bet. Never chase past one more card.`;
    } else {
      // Fold
      verdict = 'FOLD'; cls = 'pfw-ai-red';
      if (isWeak && !draws.outs) {
        title = `❌ Fold — ${handName} against ${callAmt} chips is a losing bet`;
        body  = `Your cards: <strong>${holeStr}</strong> on [${boardStr}]: ${explain}. `
              + `You win only <strong>${winPct}%</strong> of the time, but to break even on this call you need <strong>${needPct}%</strong>. `
              + `You're <strong>${needPct-winPct}% below break-even</strong> — calling costs you money every time in the long run. `
              + (raiserName ? `<strong>${raiserName}</strong> bet ${max} because they likely connected with that board. ` : '')
              + (improveHint ? improveHint + ' ' : '')
              + `<strong>Fold now.</strong> This is not weakness — this is discipline. The best players in the world fold weak hands without hesitation. Your chips are worth more in the next hand where you hold something real.`;
      } else if (drawWeak) {
        title = `❌ Fold — your draw is too weak for ${callAmt} chips`;
        body  = `Your cards: <strong>${holeStr}</strong> → <strong>${handName}</strong> with a ${draws.drawList[0]?.name||'weak draw'} (${draws.outs} outs, ~${draws.hitPct}% chance to hit). `
              + `That draw only justifies a call of roughly ${Math.round(totalPot * 0.15)}–20 chips at most. At <strong>${callAmt}</strong> chips you're overpaying massively for a low-probability outcome. Fold.`;
      } else {
        title = `❌ Fold — you need ${needPct}%, you have ${winPct}%`;
        body  = `Your cards: <strong>${holeStr}</strong> → <strong>${handName}</strong> on [${boardStr}]. `
              + `Win rate <strong>${winPct}%</strong>, break-even <strong>${needPct}%</strong> — you're <strong>${Math.abs(edgePct)}% short</strong>. `
              + (raiserName ? `<strong>${raiserName}</strong> is showing strength; respect it. ` : '')
              + `Fold, protect your stack, and wait for a hand worth fighting for.`;
      }
    }
  }

  el.innerHTML = `
    <div class="pfw-ai-inner ${cls}">
      <div class="pfw-ai-title">${title} <span class="sbt-street-badge">${streetName}</span></div>
      ${ctxLine}
      <div class="pfw-ai-body">${body}</div>
    </div>`;
  el.classList.remove('hidden');
}

// ── Main analyze ────────────────────────────────────────────────
function analyze() {
  // Read hole cards
  const hole = [readCard('hole1-rank','hole1-suit'), readCard('hole2-rank','hole2-suit')].filter(Boolean);
  if (hole.length < 2) { alert('Please enter both hole cards.'); return; }

  // Read board
  const boardSlots = [
    readCard('board0-rank','board0-suit'),
    readCard('board1-rank','board1-suit'),
    readCard('board2-rank','board2-suit'),
    readCard('board3-rank','board3-suit'),
    readCard('board4-rank','board4-suit'),
  ];
  const board = boardSlots.filter(Boolean);

  // Duplicate check
  const allCards = [...hole, ...board];
  const keys = allCards.map(cardKey);
  if (new Set(keys).size !== keys.length) { alert('Duplicate cards detected. Please check your inputs.'); return; }

  const pot        = parseFloat(document.getElementById('pot-size').value)   || 100;
  const betToCall  = parseFloat(document.getElementById('bet-to-call').value) || 0;
  const stackSize  = parseFloat(document.getElementById('stack-size').value)  || 0;
  const opponents  = parseInt(document.getElementById('opponents').value)      || 2;

  const stage = board.length === 0 ? 'preflop' : board.length <= 3 ? 'flop' : board.length === 4 ? 'turn' : 'river';

  // Street betting tracker
  if (stage !== 'preflop') {
    if (SBT.street !== stage) initSBT(stage, pot);
    else document.getElementById('sbt-section')?.classList.remove('hidden');
  } else {
    document.getElementById('sbt-section')?.classList.add('hidden');
  }

  // Equity
  const iters = stage === 'preflop' ? 5000 : 3000;
  const equity = monteCarloEquity(hole, board, opponents, iters);

  // Hand strength (post-flop only)
  const hand = board.length >= 3 ? bestHand([...hole, ...board]) : null;

  // Texture
  const texture = boardTexture(board);

  // Pre-flop category
  const preFlopCat = preFlopCategory(hole);

  // Draws
  const draws = detectDraws(hole, board);

  // Pot odds
  const potOddsVal = potOdds(pot, betToCall);

  // Advice
  const { action, handSection, drawsSection, targetSection, whySection } = coachAdvice({
    equity, potOddsVal, texture, stage, preFlopCat, hand, draws,
    stackSize, pot, betToCall, opponents
  });

  // ── Render results ──
  const resultPanel = document.getElementById('result-panel');
  resultPanel.classList.remove('hidden');

  // Flash to signal a fresh analysis (even if values look similar)
  resultPanel.classList.add('refreshed');
  setTimeout(() => resultPanel.classList.remove('refreshed'), 500);

  const pct = Math.round(equity * 100);
  document.getElementById('win-pct').textContent = pct + '%';

  // Reset bar to 0 first so the animation always plays, even if value is unchanged
  const fill = document.getElementById('prob-fill');
  fill.style.transition = 'none';
  fill.style.width = '0%';
  fill.getBoundingClientRect(); // force browser reflow
  fill.style.transition = '';
  fill.style.width = pct + '%';
  fill.className = 'prob-fill' + (pct < 35 ? ' danger' : pct < 50 ? ' caution' : '');

  document.getElementById('hand-badge').textContent =
    hand ? `${hand.name} · ${stage.toUpperCase()}` : `Pre-Flop · ${preFlopCat.label}`;

  const rec = document.getElementById('action-rec');
  rec.textContent = action.toUpperCase();
  rec.className = 'action-recommendation ' + action;

  const renderList = (id, items) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = items.map(i => `<p>${i}</p>`).join('');
  };
  renderList('detail-hand',   handSection);
  renderList('detail-draws',  drawsSection);
  renderList('detail-target', targetSection);
  renderList('detail-why',    whySection);

  // highlight recommended button
  document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
  const btnMap = { fold:'btn-fold', call:'btn-call', check:'btn-check', raise:'btn-raise' };
  const btnEl = document.getElementById(btnMap[action]);
  if (btnEl) btnEl.classList.add('selected');

  document.getElementById('action-feedback').textContent = '';

  renderCards(hole, board);

  // Showdown panel (river only)
  const dwWrap = document.getElementById('declare-winner-wrap');
  if (dwWrap) {
    if (stage === 'river') {
      buildShowdownPanel(board, hole);
      dwWrap.classList.remove('hidden');
    } else {
      dwWrap.classList.add('hidden');
    }
  }

  resultPanel.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

// ── Action button feedback ──────────────────────────────────────
function setupActionButtons() {
  const msgs = {
    'btn-fold':  'You chose to fold. Discipline over emotion — good laydowns win sessions.',
    'btn-call':  'You chose to call. Keep pot control and re-evaluate on the next street.',
    'btn-raise': 'You chose to raise. Aggression is power — make opponents pay to draw.',
    'btn-check': 'You chose to check. Control the pot and gather information.',
  };
  Object.entries(msgs).forEach(([id, msg]) => {
    document.getElementById(id).addEventListener('click', () => {
      document.querySelectorAll('.act-btn').forEach(b => b.classList.remove('selected'));
      document.getElementById(id).classList.add('selected');
      document.getElementById('action-feedback').textContent = msg;
    });
  });
}

// ── Pre-flop Wizard ─────────────────────────────────────────────
const PFW = {
  sbAmt:      5,
  bbMinAmt:   5,     // BB must at least match SB (can also raise)
  currentBet: 5,
  pot:        0,
  youPosted:  0,
  bbPosted:   0,
  decided:    false,
};

function pfwSyncNames() {
  const sb = BT.players.find(p => p.sb);
  const bb = BT.players.find(p => p.bb);
  const sbEl = document.getElementById('pfw-sb-name');
  const bbEl = document.getElementById('pfw-bb-name');
  if (sbEl) sbEl.textContent = sb ? sb.name : '(no SB set)';
  if (bbEl) bbEl.textContent = bb ? bb.name : '(no BB set)';
}

function pfwLockStep(id) {
  document.getElementById(id)?.classList.replace('active', 'locked');
}
function pfwActivateStep(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.remove('locked'); el.classList.add('active'); }
}

function pfwReset() {
  PFW.decided = false;
  pfwActivateStep('pfw-step1');
  pfwLockStep('pfw-step2');
  pfwLockStep('pfw-step3');
  const res = document.getElementById('pfw-result');
  if (res) { res.classList.add('hidden'); res.querySelector('#pfw-result-inner').innerHTML = ''; }
  document.getElementById('pfw-go-analyze')?.classList.add('hidden');
  document.getElementById('pfw-ai-rec')?.classList.add('hidden');
  document.querySelectorAll('.pfw-act-btn').forEach(b => b.classList.remove('pfw-suggested'));
  // reset raise inputs
  const bbRaise = document.getElementById('pfw-bb-raise-amt');
  const youRaise = document.getElementById('pfw-you-raise-amt');
  if (bbRaise) bbRaise.value = '';
  if (youRaise) youRaise.value = '';
  pfwSyncNames();
}

function pfwUpdateSBDisplay() {
  const sb = parseInt(document.getElementById('pfw-sb-amt')?.value) || 5;
  PFW.sbAmt    = sb;
  PFW.bbMinAmt = sb;           // BB minimum = same as SB (can raise higher)
  PFW.currentBet = sb;
  const minEl  = document.getElementById('pfw-bb-min-display');
  const callLbl = document.getElementById('pfw-bb-call-label');
  const raiseIn = document.getElementById('pfw-bb-raise-amt');
  if (minEl)   minEl.textContent   = PFW.bbMinAmt;
  if (callLbl) callLbl.textContent  = PFW.bbMinAmt;
  if (raiseIn) raiseIn.min         = PFW.bbMinAmt + 1;
  if (raiseIn) raiseIn.placeholder = `min ${PFW.bbMinAmt + 1}`;
}

function pfwShowResult(html, showAnalyze) {
  const res = document.getElementById('pfw-result');
  document.getElementById('pfw-result-inner').innerHTML = html;
  const goBtn = document.getElementById('pfw-go-analyze');
  goBtn?.classList.toggle('hidden', !showAnalyze);
  res?.classList.remove('hidden');
  res?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function pfwAfterBBDecision(bbPostedAmt) {
  PFW.bbPosted   = bbPostedAmt;
  PFW.currentBet = bbPostedAmt;
  PFW.pot        = PFW.sbAmt + bbPostedAmt;

  pfwLockStep('pfw-step2');
  pfwActivateStep('pfw-step3');

  const you     = BT.players[0];
  const sbName  = BT.players.find(p => p.sb)?.name || 'SB';
  const bbName  = BT.players.find(p => p.bb)?.name || 'BB';
  const bbRaised = bbPostedAmt > PFW.bbMinAmt;

  // How much You have already committed
  PFW.youPosted = you.sb ? PFW.sbAmt : you.bb ? PFW.bbMinAmt : 0;
  const callAmt = Math.max(0, PFW.currentBet - PFW.youPosted);

  const bbAction = bbRaised
    ? `<strong>${bbName}</strong> <span class="pfw-raised-badge">RAISED</span> to <strong>${bbPostedAmt}</strong> chips.`
    : `<strong>${bbName}</strong> called / matched SB — posted <strong>${bbPostedAmt}</strong> chips.`;

  const youNote = PFW.youPosted > 0
    ? ` <em>(you already posted ${PFW.youPosted}, so net cost = ${callAmt})</em>` : '';

  const minRaise  = PFW.currentBet * 2;
  const raiseIn   = document.getElementById('pfw-you-raise-amt');
  const callBtn   = document.getElementById('pfw-you-call');
  const callLabel = document.getElementById('pfw-you-call-label');

  if (raiseIn)   { raiseIn.min = minRaise; raiseIn.placeholder = `min ${minRaise}`; }
  if (callLabel) callLabel.textContent = callAmt;

  // BB option: if BB only matched SB and you ARE the BB → free check
  const youAreBB  = you.bb;
  const isFreeCheck = youAreBB && !bbRaised;
  if (callBtn) callBtn.disabled = isFreeCheck;

  let callBtnLabel = callAmt === 0 ? 'Check (free)' : `Call ${callAmt}`;
  if (isFreeCheck) callBtnLabel = 'Check (BB option — free)';
  if (callBtn) callBtn.textContent = callBtnLabel;

  // Decision context — show full blind summary
  const actionRequired = bbRaised
    ? `⚠️ BB raised! To continue you must call <strong>${callAmt}</strong> more chips (total ${PFW.currentBet}).`
    : callAmt > 0
    ? `To continue you must call <strong>${callAmt}</strong> chips to match the BB.`
    : `BB just matched the SB — <strong>you can check for free</strong> or raise.`;

  document.getElementById('pfw-situation').innerHTML = `
    <div class="pfw-sit-row">🔵 <strong>${sbName}</strong> <span class="pfw-role-tag sb-tag">SB</span> posted <strong>${PFW.sbAmt}</strong> chips.</div>
    <div class="pfw-sit-row">🔴 ${bbAction}</div>
    <div class="pfw-sit-row">🏦 Pot so far: <strong>${PFW.pot}</strong> chips &nbsp;|&nbsp; Bet to match: <strong>${PFW.currentBet}</strong></div>
    <div class="pfw-sit-row pfw-action-req">${actionRequired}</div>
    <div class="pfw-sit-row">👤 Your position${PFW.youPosted > 0 ? ` — already posted ${PFW.youPosted}` : ''}: net call = <strong>${callAmt}</strong>${youNote ? '' : ' chips'}</div>
  `;

  document.getElementById('pfw-step3').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // Auto-suggest if cards already entered
  pfwAdvice();
}

function pfwAdvice() {
  const el = document.getElementById('pfw-ai-rec');
  if (!el) return;

  const h1 = readCard('hole1-rank', 'hole1-suit');
  const h2 = readCard('hole2-rank', 'hole2-suit');
  if (!h1 || !h2) {
    el.innerHTML = `<div class="pfw-ai-note">⬆️ Enter your two hole cards in the <strong>Card Input</strong> section below, then tap the button again to get a recommendation.</div>`;
    el.classList.remove('hidden');
    return;
  }

  const hole      = [h1, h2];
  const cat       = preFlopCategory(hole);
  const callAmt   = Math.max(0, PFW.currentBet - PFW.youPosted);
  const pot       = PFW.pot;
  const bbRaised  = PFW.bbPosted > PFW.bbMinAmt;
  const odds      = potOdds(pot, callAmt);
  const needPct   = odds !== null ? Math.round(odds * 100) : 0;
  const opponents = Math.max(1, BT.players.filter((p, i) => i !== 0 && !p.folded).length);

  // Rough win-rate estimates by tier (heads-up adjusted)
  const tierEq = { premium: 72, strong: 58, marginal: 48, speculative: 40, trash: 32 };
  const estEq  = Math.max(0, (tierEq[cat.tier] || 40) - (opponents - 1) * 4);

  let verdict, title, body, cls;

  if (cat.tier === 'premium') {
    verdict = 'RAISE'; cls = 'pfw-ai-gold';
    title = `🚀 Raise — you have a premium hand`;
    body  = `You are holding <strong>${cat.label}</strong>, one of the best starting hands in poker (top 5%). `
           + (bbRaised
              ? `BB raised to ${PFW.currentBet} — re-raise to about <strong>${PFW.currentBet * 3}</strong> chips. Don’t just call here; re-raising shows strength and narrows the field.`
              : `Raise to 3–4× the big blind right now. Limping or just calling lets weak hands in cheaply and lets them get lucky.`)
           + ` You win roughly <strong>${estEq}%</strong> of the time with this hand vs ${opponents} opponent${opponents>1?'s':''}.`;
  } else if (cat.tier === 'strong') {
    if (callAmt === 0) {
      verdict = 'RAISE'; cls = 'pfw-ai-gold';
      title = `🚀 Raise — strong hand, build the pot now`;
      body  = `You have <strong>${cat.label}</strong> — top 15% of starting hands and you're likely ahead right now. Since it's free to check, most beginners check here, but the correct play is to <strong>raise ${PFW.bbMinAmt * 3} chips</strong> (3× BB): you build the pot while you hold the advantage and you force weak speculative hands to pay or fold. Checking gives everyone a free card to outdraw you.`;
    } else if (needPct < 25) {
      verdict = 'CALL'; cls = 'pfw-ai-blue';
      title = `✅ Call — good hand, worth the price`;
      body  = `You have <strong>${cat.label}</strong>. You need to win at least <strong>${needPct}%</strong> to break even — your estimated win rate is <strong>${estEq}%</strong>. `
             + `Calling <strong>${callAmt}</strong> chips is clearly profitable.`
             + (bbRaised ? ` BB raised, which is concerning, but your hand is strong enough to continue.` : '');
    } else {
      verdict = 'CALL'; cls = 'pfw-ai-blue';
      title = `✅ Call — strong enough to continue`;
      body  = `You have <strong>${cat.label}</strong>. Even at ${needPct}% required equity, your estimated ${estEq}% win rate justifies the call. `
             + (bbRaised ? `BB raised aggressively — consider whether a re-raise makes sense, but calling is safe.` : `See the flop before committing more.`);
    }
  } else if (cat.tier === 'marginal') {
    if (callAmt === 0) {
      verdict = 'CHECK'; cls = 'pfw-ai-blue';
      title = `✓ Check — marginal hand, take the free card`;
      body  = `You have <strong>${cat.label}</strong> — an average hand. See the flop for free. Only continue post-flop if you hit <strong>two pair or better</strong>. Fold to any big bet on the flop if you miss.`;
    } else if (needPct < 20) {
      verdict = 'CALL'; cls = 'pfw-ai-caution';
      title = `⚠️ Thin call — only because the price is small`;
      body  = `You have <strong>${cat.label}</strong>. Normally this hand isn’t strong enough to call a raise, but at only <strong>${callAmt}</strong> chips (${needPct}% of the pot) it’s barely justifiable. `
             + `Be strict after the flop: fold immediately if you don’t connect strongly.`;
    } else {
      verdict = 'FOLD'; cls = 'pfw-ai-red';
      title = `❌ Fold — not worth the price`;
      body  = `You have <strong>${cat.label}</strong>. You’d need to win at least <strong>${needPct}%</strong> of the time to break even, but this hand only wins ~<strong>${estEq}%</strong> vs ${opponents} opponent${opponents>1?'s':''}. `
             + `Save your chips. Fold confidently — this is the disciplined play.`;
    }
  } else if (cat.tier === 'speculative') {
    if (callAmt === 0) {
      verdict = 'CHECK'; cls = 'pfw-ai-blue';
      title = `✓ Check — speculative, but free`;
      body  = `You have <strong>${cat.label}</strong>. It needs to hit big on the flop (set, flush draw, straight draw). Take the free look — but fold immediately to any bet unless you connect strongly.`;
    } else if (needPct < 15) {
      verdict = 'CALL'; cls = 'pfw-ai-caution';
      title = `⚠️ Speculative call — only because it’s cheap`;
      body  = `You have <strong>${cat.label}</strong>. This hand can win big IF it hits, and the price is cheap enough to take the gamble. But if the flop completely misses you (no pair, no draw) — fold immediately. Don’t chase.`;
    } else {
      verdict = 'FOLD'; cls = 'pfw-ai-red';
      title = `❌ Fold — too expensive for a speculative hand`;
      body  = `You have <strong>${cat.label}</strong>. This hand needs to hit a set, flush, or straight to be profitable. At <strong>${callAmt}</strong> chips (${needPct}% of the pot), the price is too high for that small chance. Fold.`;
    }
  } else {
    if (callAmt === 0) {
      verdict = 'CHECK'; cls = 'pfw-ai-blue';
      title = `✓ Check — weak hand, free card only`;
      body  = `You have <strong>${cat.label}</strong> — a below-average hand. Only check because it’s free. Fold to any bet on the flop unless you hit two pair or better.`;
    } else {
      verdict = 'FOLD'; cls = 'pfw-ai-red';
      title = `❌ Fold — weak hand, cut your losses`;
      body  = `You have <strong>${cat.label}</strong>. This hand wins only ~<strong>${estEq}%</strong> of the time. You need ${needPct}% to break even. `
             + `Every chip you put in with a weak hand is money lost on average. Fold now and wait for a hand worth playing.`;
    }
  }

  el.innerHTML = `
    <div class="pfw-ai-inner ${cls}">
      <div class="pfw-ai-title">${title}</div>
      <div class="pfw-ai-body">${body}</div>
    </div>`;
  el.classList.remove('hidden');
  // Highlight the corresponding action button
  document.querySelectorAll('.pfw-act-btn').forEach(b => b.classList.remove('pfw-suggested'));
  const btnMap = { FOLD:'pfw-you-fold', CALL:'pfw-you-call', CHECK:'pfw-you-call', RAISE:'pfw-you-raise' };
  document.getElementById(btnMap[verdict])?.classList.add('pfw-suggested');
}

function pfwFinish(decision, amount) {
  PFW.decided = true;
  const you   = BT.players[0];

  if (decision === 'fold') {
    pfwShowResult(`
      <div class="pfw-verdict fold">❌ You FOLDED pre-flop.</div>
      <p>Good discipline. Folding bad hands is how the pros protect their stack.<br>
      You lose nothing — SB/BB posts are sunk costs. Wait for a better spot.</p>
    `, false);
    return;
  }

  // call or raise — set up the pot for analysis
  const totalYouPut = PFW.youPosted + amount;
  const newPot = PFW.pot + amount;

  // If you raised, others still need to call — bet-to-call from their perspective = your raise amount
  const betFacingOthers = decision === 'raise' ? amount : 0;

  document.getElementById('pot-size').value    = newPot;
  document.getElementById('bet-to-call').value  = betFacingOthers;

  // opponents = total players minus you
  const opponentCount = Math.max(1, BT.players.length - 1);
  document.getElementById('opponents').value    = opponentCount;

  const label = decision === 'call'
    ? `✅ You CALLED <strong>${amount}</strong> chips.`
    : `🚀 You RAISED to <strong>${amount}</strong> chips.`;

  pfwShowResult(`
    <div class="pfw-verdict ${decision}">${label}</div>
    <div class="pfw-pot-summary">
      <span>Pot: <strong>${newPot}</strong></span>
      <span>You put in: <strong>${totalYouPut}</strong></span>
      <span>Opponents: <strong>${opponentCount}</strong></span>
    </div>
    <p>Enter your hole cards below and click <strong>Analyze Hand</strong>.</p>
  `, true);
}

function setupPreFlopWizard() {
  pfwSyncNames();

  // SB amount changes → update BB minimum display
  document.getElementById('pfw-sb-amt')?.addEventListener('input', pfwUpdateSBDisplay);

  // Step 1 → Step 2
  document.getElementById('pfw-step1-next')?.addEventListener('click', () => {
    pfwUpdateSBDisplay();
    pfwSyncNames();
    const sbEl = document.getElementById('pfw-sb-name');
    if (sbEl && sbEl.textContent === '(no SB set)') {
      sbEl.style.color = '#e74c3c';
      sbEl.textContent = '⚠ No SB assigned — assign roles in Blind Tracker';
      return;
    }
    pfwLockStep('pfw-step1');
    pfwActivateStep('pfw-step2');

    const bbName = BT.players.find(p => p.bb)?.name || 'BB';
    const prompt = document.getElementById('pfw-bb-prompt');
    if (prompt) prompt.innerHTML =
      `<strong>${bbName}</strong> must post at least <strong>${PFW.bbMinAmt}</strong> chips (match the SB).
       They can call or raise to any amount.`;

    document.getElementById('pfw-step2').scrollIntoView({ behavior:'smooth', block:'nearest' });
  });

  // BB calls
  document.getElementById('pfw-bb-call')?.addEventListener('click', () => {
    pfwAfterBBDecision(PFW.bbMinAmt);
  });

  // BB raises
  document.getElementById('pfw-bb-raise')?.addEventListener('click', () => {
    const raiseAmt = parseInt(document.getElementById('pfw-bb-raise-amt')?.value);
    if (!raiseAmt || raiseAmt <= PFW.bbMinAmt) {
      document.getElementById('pfw-bb-raise-amt')?.focus();
      return;
    }
    pfwAfterBBDecision(raiseAmt);
  });

  // You fold
  document.getElementById('pfw-you-fold')?.addEventListener('click', () => {
    pfwFinish('fold', 0);
  });

  // You call
  document.getElementById('pfw-you-call')?.addEventListener('click', () => {
    const you     = BT.players[0];
    const callAmt = Math.max(0, PFW.currentBet - PFW.youPosted);
    pfwFinish('call', callAmt);
  });

  // You raise
  document.getElementById('pfw-you-raise')?.addEventListener('click', () => {
    const amt = parseInt(document.getElementById('pfw-you-raise-amt')?.value);
    const minRaise = PFW.currentBet * 2;
    if (!amt || amt < minRaise) {
      document.getElementById('pfw-you-raise-amt')?.focus();
      return;
    }
    pfwFinish('raise', amt);
  });

  document.getElementById('pfw-get-advice')?.addEventListener('click', pfwAdvice);
  // Reset
  document.getElementById('pfw-reset')?.addEventListener('click', pfwReset);

  // Go to analysis
  document.getElementById('pfw-go-analyze')?.addEventListener('click', () => {
    document.querySelector('.card-section')?.scrollIntoView({ behavior:'smooth' });
  });
}

// ── Blind Tracker ────────────────────────────────────────────────
let BT = {
  players: [{ name: 'You', dealer: false, sb: false, bb: false, wins: 0, folded: false, action: null }],
  dragSrc: null,
  lastWinnerIdx: null,
};

function btPositionLabel(idx) {
  const n    = BT.players.length;
  const dIdx = BT.players.findIndex(p => p.dealer);
  if (dIdx < 0) return '—';
  const rel = ((idx - dIdx) % n + n) % n;
  if (rel === 0) return 'BTN';
  if (rel === 1) return 'SB';
  if (rel === 2) return 'BB';
  if (rel === n - 1) return 'CO';
  if (rel === n - 2 && n >= 6) return 'HJ';
  if (rel === 3 && n > 4) return 'UTG';
  if (rel === 4 && n > 5) return 'UTG+1';
  return 'MP';
}

function assignRole(idx, role) {
  const alreadySet = BT.players[idx][role];
  BT.players.forEach(p => p[role] = false);
  if (!alreadySet) BT.players[idx][role] = true;
  renderBlindTracker();
}

function addPlayer(name) {
  if (BT.players.length >= 9) { alert('Maximum 9 players.'); return; }
  BT.players.push({
    name: (name || '').trim() || `P${BT.players.length + 1}`,
    dealer: false, sb: false, bb: false, wins: 0, folded: false, action: null
  });
  renderBlindTracker();
}

function removePlayer(idx) {
  if (idx === 0) return;                          // can't remove "You"
  if (BT.players.length <= 2) return;             // min 2 players
  BT.players.splice(idx, 1);
  renderBlindTracker();
}

function renderBlindTracker() {
  const container = document.getElementById('bt-seats');
  const info      = document.getElementById('bt-info');
  if (!container) return;
  container.innerHTML = '';

  // Oval table felt in background
  const felt = document.createElement('div');
  felt.className = 'bt-table-felt';
  felt.innerHTML = '<span class="bt-table-label">⟳ Clockwise</span>';
  container.appendChild(felt);

  const n = BT.players.length;

  BT.players.forEach((p, i) => {
    const isYou = i === 0;
    const pos   = btPositionLabel(i);

    // Elliptical placement: start from top (270°), go clockwise
    const angleDeg = 270 + (i / n) * 360;
    const angleRad = angleDeg * Math.PI / 180;
    const xPct = 50 + 42 * Math.cos(angleRad);
    const yPct = 50 + 40 * Math.sin(angleRad);

    const seat = document.createElement('div');
    seat.className = ['bt-seat',
      isYou    && 'you',
      p.dealer && 'is-dealer',
      p.sb     && 'is-sb',
      p.bb     && 'is-bb',
      p.folded && 'is-folded',
      !isYou   && 'draggable-seat',
    ].filter(Boolean).join(' ');
    seat.style.left = xPct + '%';
    seat.style.top  = yPct + '%';

    seat.innerHTML = `
      <div class="seat-role-row">
        <button class="role-btn d-role${p.dealer?' active':''}"  data-idx="${i}" data-role="dealer" title="Dealer / Button">D</button>
        <button class="role-btn sb-role${p.sb?' active':''}"     data-idx="${i}" data-role="sb"     title="Small Blind">SB</button>
        <button class="role-btn bb-role${p.bb?' active':''}"     data-idx="${i}" data-role="bb"     title="Big Blind">BB</button>
      </div>
      <div class="seat-avatar">${isYou ? '🧑' : '👤'}</div>
      <div class="seat-name${isYou ? ' seat-name-editable' : ''}" ${isYou ? `data-idx="0" title="Click to rename"` : ''}>${p.name}</div>
      <div class="seat-pos">${pos}</div>
      <div class="seat-act-row">
        <button class="seat-act fold-act${p.folded ? ' s-act-on' : ''}" data-idx="${i}" data-act="folded" title="Folded">F</button>
        <button class="seat-act raise-act${p.action === 'raised' ? ' s-act-on' : ''}" data-idx="${i}" data-act="raised" title="Raised">R</button>
        <button class="seat-act check-act${p.action === 'checked' ? ' s-act-on' : ''}" data-idx="${i}" data-act="checked" title="Checked">✓</button>
      </div>
      ${!isYou ? `<button class="seat-remove" data-idx="${i}" title="Remove player">×</button>` : ''}
      ${!isYou ? `<div class="drag-handle" title="Drag to reorder seat">⠿</div>` : ''}
    `;

    // Draggable (non-You seats only)
    if (!isYou) {
      seat.draggable = true;
      seat.addEventListener('dragstart', e => {
        BT.dragSrc = i;
        seat.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(i));
      });
      seat.addEventListener('dragend', () => {
        BT.dragSrc = null;
        container.querySelectorAll('.bt-seat').forEach(s =>
          s.classList.remove('dragging', 'drag-over')
        );
      });
    }

    // Drop target (not onto "You" seat)
    seat.addEventListener('dragover', e => {
      if (BT.dragSrc !== null && BT.dragSrc !== i && i !== 0) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        seat.classList.add('drag-over');
      }
    });
    seat.addEventListener('dragleave', () => seat.classList.remove('drag-over'));
    seat.addEventListener('drop', e => {
      e.preventDefault();
      seat.classList.remove('drag-over');
      const src = BT.dragSrc;
      if (src !== null && src !== i && i !== 0) {
        [BT.players[src], BT.players[i]] = [BT.players[i], BT.players[src]];
        BT.dragSrc = null;
        renderBlindTracker();
      }
    });

    container.appendChild(seat);
  });

  // Wire role + remove + action buttons
  container.querySelectorAll('.role-btn').forEach(btn =>
    btn.addEventListener('click', () => assignRole(+btn.dataset.idx, btn.dataset.role))
  );
  container.querySelectorAll('.seat-remove').forEach(btn =>
    btn.addEventListener('click', () => removePlayer(+btn.dataset.idx))
  );
  container.querySelectorAll('.seat-act').forEach(btn =>
    btn.addEventListener('click', e => { e.stopPropagation(); setSeatAction(+btn.dataset.idx, btn.dataset.act); })
  );

  // Inline rename for "You" seat
  container.querySelectorAll('.seat-name-editable').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (el.querySelector('input')) return; // already editing
      const cur = BT.players[0].name;
      const inp = document.createElement('input');
      inp.className   = 'seat-name-input';
      inp.value       = cur;
      inp.maxLength   = 12;
      inp.title       = 'Press Enter or click away to save';
      el.textContent  = '';
      el.appendChild(inp);
      inp.focus(); inp.select();
      const commit = () => {
        const val = inp.value.trim() || cur;
        BT.players[0].name = val;
        savePlayersToStorage();
        renderBlindTracker();
      };
      inp.addEventListener('keydown', e2 => {
        if (e2.key === 'Enter') { e2.preventDefault(); commit(); }
        if (e2.key === 'Escape') { renderBlindTracker(); }
      });
      inp.addEventListener('blur', commit);
    });
  });

  pfwSyncNames();

  if (info) {
    const pos = btPositionLabel(0);
    const you = BT.players[0];
    const posDescs = {
      BTN:     'Dealer / Button — last to act post-flop. <strong>Best position.</strong>',
      SB:      'Small Blind — first to act post-flop. <strong>Weakest position.</strong>',
      BB:      'Big Blind — last to act pre-flop.',
      UTG:     'Under the Gun — first to act pre-flop. Play tight.',
      'UTG+1': 'UTG+1 — second pre-flop. Play tight.',
      MP:      'Middle Position — moderate range.',
      HJ:      'Hijack — good late-position play.',
      CO:      'Cutoff — second-best seat.',
      '—':     'No dealer assigned. Click <strong>D</strong> on any seat to set positions.',
    };
    const roleNote = you.dealer ? ' — <strong>You are the Dealer (Button).</strong>' :
                     you.sb     ? ' — <strong>You must post the Small Blind.</strong>' :
                     you.bb     ? ' — <strong>You must post the Big Blind.</strong>' : '';
    info.innerHTML = `Your seat: <strong>${pos}</strong> — ${posDescs[pos] || ''}${roleNote}`;
  }
  savePlayersToStorage();
  renderLeaderboard();
}

// ── Seat action toggle ────────────────────────────────────────────
function setSeatAction(idx, act) {
  const p = BT.players[idx];
  if (!p) return;
  if (act === 'folded') {
    p.folded = !p.folded;
    if (p.folded) p.action = null;
  } else {
    p.action = (p.action === act) ? null : act;
    if (p.action) p.folded = false;
  }
  const activeOpps = BT.players.filter((pl, i) => i > 0 && !pl.folded).length;
  const oppEl = document.getElementById('opponents');
  if (oppEl) oppEl.value = Math.max(1, activeOpps);
  renderBlindTracker();
}

// ── Storage persistence ──────────────────────────────────────────
function savePlayersToStorage() {
  try {
    localStorage.setItem('pokerCoach_players', JSON.stringify(
      BT.players.map(p => ({ name: p.name, wins: p.wins || 0 }))
    ));
  } catch(e) {}
}

function loadPlayersFromStorage() {
  try {
    const raw = localStorage.getItem('pokerCoach_players');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return;
    BT.players = saved.map((p, i) => ({
      name:   p.name || (i === 0 ? 'You' : `P${i + 1}`),
      wins:   p.wins  || 0,
      dealer: false, sb: false, bb: false,
      folded: false, action: null,
    }));
  } catch(e) {}
}

// ── Leaderboard ──────────────────────────────────────────────────
function renderLeaderboard() {
  const container = document.getElementById('lb-table');
  if (!container) return;
  const sorted = [...BT.players]
    .map((p, i) => ({ ...p, origIdx: i }))
    .sort((a, b) => (b.wins || 0) - (a.wins || 0));
  if (sorted.every(p => (p.wins || 0) === 0)) {
    container.innerHTML = '<p class="lb-empty">No wins yet — declare a winner after the river.</p>';
    return;
  }
  const maxWins = sorted[0].wins || 1;
  container.innerHTML = sorted.map((p, rank) => {
    const medal = rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`;
    const barPct = Math.round(((p.wins || 0) / maxWins) * 100);
    const isRecent = BT.lastWinnerIdx !== null && p.origIdx === BT.lastWinnerIdx;
    return `<div class="lb-row${rank === 0 && p.wins > 0 ? ' lb-top' : ''}">
      <span class="lb-rank">${medal}</span>
      <span class="lb-name">${p.name}${isRecent ? ' <span class="lb-crown" title="Last hand winner">🏆</span>' : ''}</span>
      <div class="lb-bar-wrap"><div class="lb-bar" style="width:${barPct}%"></div></div>
      <span class="lb-wins">${p.wins || 0} win${(p.wins || 0) !== 1 ? 's' : ''}</span>
    </div>`;
  }).join('');
}

function declareWinner(playerIdx, silent = false) {
  if (playerIdx < 0 || playerIdx >= BT.players.length) return;
  BT.players[playerIdx].wins = (BT.players[playerIdx].wins || 0) + 1;
  BT.lastWinnerIdx = playerIdx;
  savePlayersToStorage();
  renderLeaderboard();
  if (!silent) {
    BT.players.forEach(p => { p.folded = false; p.action = null; });
    renderBlindTracker();
    const wrap = document.getElementById('declare-winner-wrap');
    if (wrap) wrap.classList.add('hidden');
  }
  const feedback = document.getElementById('action-feedback');
  if (feedback) feedback.innerHTML = `🏆 <strong>${BT.players[playerIdx].name}</strong> wins this hand! Leaderboard updated.`;
}

// ── Showdown panel ──────────────────────────────────────────────
function buildShowdownPanel(board, yourHole) {
  const wrap = document.getElementById('declare-winner-wrap');
  if (!wrap) return;
  const active = BT.players.map((p, i) => ({ ...p, idx: i })).filter(p => !p.folded);

  let playersHtml = '';
  active.forEach(p => {
    const isYou = p.idx === 0;
    const avatar = isYou ? '🧑' : '👤';
    let cardsHtml = '';
    if (isYou) {
      if (yourHole.length === 2) {
        const fmt = c => `<span class="sd-card ${SUIT_CLASS[c.suit]}">${c.rank === 'T' ? '10' : c.rank}${c.suit}</span>`;
        cardsHtml = `<div class="sd-your-cards">${fmt(yourHole[0])}${fmt(yourHole[1])}</div>`;
      } else {
        cardsHtml = `<div class="sd-no-cards">Enter your hole cards above first</div>`;
      }
    } else {
      cardsHtml =
        `<div class="sd-card-inputs">` +
        `<div class="card-slot"><select class="rank-select" id="sd-${p.idx}-r1"><option value="">Rank</option></select>` +
        `<div class="suit-picker" id="sd-${p.idx}-s1"></div></div>` +
        `<div class="card-slot"><select class="rank-select" id="sd-${p.idx}-r2"><option value="">Rank</option></select>` +
        `<div class="suit-picker" id="sd-${p.idx}-s2"></div></div></div>`;
    }
    playersHtml +=
      `<div class="sd-player${isYou ? ' sd-you' : ''}" data-idx="${p.idx}">` +
      `<div class="sd-pname">${avatar} <strong>${p.name}</strong></div>${cardsHtml}</div>`;
  });

  wrap.innerHTML =
    `<div class="dw-label">🃏 Showdown — Enter each player's hole cards then compare</div>` +
    `<div class="sd-players">${playersHtml}</div>` +
    `<button class="analyze-btn sd-compare-btn" id="sd-compare-btn" type="button">🔍 Compare All Hands &amp; Find Winner</button>` +
    `<div class="sd-result hidden" id="sd-result"></div>`;

  wrap.querySelectorAll('.rank-select').forEach(sel => {
    RANKS.forEach(r => {
      const o = document.createElement('option');
      o.value = r; o.textContent = r === 'T' ? '10' : r;
      sel.appendChild(o);
    });
  });
  wrap.querySelectorAll('.suit-picker').forEach(initSuitPicker);
  document.getElementById('sd-compare-btn')?.addEventListener('click', () => runShowdown(board, yourHole, active));
}

function runShowdown(board, yourHole, activePlayers) {
  const resultEl = document.getElementById('sd-result');
  if (!resultEl) return;

  const entries = [];
  const usedKeys = new Set(board.map(cardKey));

  if (activePlayers.some(p => p.idx === 0) && yourHole.length === 2) {
    if (!yourHole.some(c => usedKeys.has(cardKey(c)))) {
      yourHole.forEach(c => usedKeys.add(cardKey(c)));
      entries.push({ name: BT.players[0].name, idx: 0, hole: yourHole, hand: bestHand([...yourHole, ...board]) });
    }
  }

  let errorMsg = '';
  for (const p of activePlayers.filter(p => p.idx !== 0)) {
    const c1 = readCard(`sd-${p.idx}-r1`, `sd-${p.idx}-s1`);
    const c2 = readCard(`sd-${p.idx}-r2`, `sd-${p.idx}-s2`);
    if (!c1 || !c2) { errorMsg = `Enter both hole cards for <strong>${p.name}</strong>.`; break; }
    const k1 = cardKey(c1), k2 = cardKey(c2);
    if (k1 === k2 || usedKeys.has(k1) || usedKeys.has(k2)) {
      errorMsg = `<strong>${p.name}</strong> has a duplicate or already-used card.`; break;
    }
    usedKeys.add(k1); usedKeys.add(k2);
    entries.push({ name: p.name, idx: p.idx, hole: [c1, c2], hand: bestHand([c1, c2, ...board]) });
  }

  if (errorMsg) {
    resultEl.innerHTML = `<p class="sd-error">⚠️ ${errorMsg}</p>`;
    resultEl.classList.remove('hidden');
    return;
  }
  if (entries.length === 0) {
    resultEl.innerHTML = `<p class="sd-error">⚠️ No active players to compare.</p>`;
    resultEl.classList.remove('hidden');
    return;
  }

  entries.sort((a, b) => {
    if (!a.hand && !b.hand) return 0;
    if (!a.hand) return 1;
    if (!b.hand) return -1;
    return compareHands(b.hand, a.hand);
  });

  const winner = entries[0];
  const cardHtml = c => `<span class="sd-card ${SUIT_CLASS[c.suit]}">${c.rank === 'T' ? '10' : c.rank}${c.suit}</span>`;

  let html = `<div class="sd-results-table">`;
  entries.forEach((e, rank) => {
    const isWin = rank === 0;
    html +=
      `<div class="sd-result-row${isWin ? ' sd-winner-row' : ''}">` +
      `<span class="sd-rank-badge">${isWin ? '🏆' : (rank + 1) + '.'}</span>` +
      `<span class="sd-pname-cell">${e.idx === 0 ? '🧑' : '👤'} <strong>${e.name}</strong></span>` +
      `<span class="sd-hole-disp">${e.hole.map(cardHtml).join('')}</span>` +
      `<span class="sd-hand-label">${e.hand ? e.hand.name : '—'}</span></div>`;
  });
  html += `</div>`;

  const loser = entries[1];
  html += `<div class="sd-verdict">🏆 <strong>${winner.name}</strong> wins with <strong>${winner.hand ? winner.hand.name : 'best hand'}</strong>` +
    (loser ? ` — beats ${loser.name}${entries.length > 2 ? ` and ${entries.length - 2} other${entries.length > 3 ? 's' : ''}` : ''} (${loser.hand ? loser.hand.name : '—'})` : '') +
    `.</div>`;

  const handWhys = {
    'High Card':       'no pairs made — the highest individual card wins',
    'One Pair':        'two cards of the same rank',
    'Two Pair':        'two different pairs combined',
    'Three of a Kind': 'three cards sharing the same rank',
    'Straight':        'five cards in consecutive numerical order',
    'Flush':           'five cards all of the same suit',
    'Full House':      'three of a kind combined with a pair',
    'Four of a Kind':  'all four cards of the same rank',
    'Straight Flush':  'five consecutive cards all of the same suit',
    'Royal Flush':     'the highest straight flush — A-K-Q-J-10 of the same suit',
  };
  if (winner.hand) {
    const why = handWhys[winner.hand.name] || winner.hand.name;
    html += `<div class="sd-why">📖 <strong>${winner.hand.name}:</strong> ${why}. This outranks all other hands at the table.</div>`;
  }

  resultEl.innerHTML = html;
  resultEl.classList.remove('hidden');
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  declareWinner(winner.idx, true);
}

function setupBlindTracker() {
  const addBtn     = document.getElementById('bt-add-btn');
  const addForm    = document.getElementById('bt-add-form');
  const nameInput  = document.getElementById('bt-name-input');
  const confirmBtn = document.getElementById('bt-confirm-add');
  const cancelBtn  = document.getElementById('bt-cancel-add');
  const nextBtn    = document.getElementById('bt-next');

  const openAddForm = () => {
    addForm.classList.remove('hidden');
    nameInput.focus();
    addBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  addBtn?.addEventListener('click', () => {
    addForm.classList.toggle('hidden');
    if (!addForm.classList.contains('hidden')) nameInput.focus();
  });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      openAddForm();
    }
  });

  confirmBtn?.addEventListener('click', () => {
    addPlayer(nameInput.value);
    nameInput.value = '';
    addForm.classList.add('hidden');
  });

  nameInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter')  confirmBtn.click();
    if (e.key === 'Escape') cancelBtn.click();
  });

  cancelBtn?.addEventListener('click', () => {
    nameInput.value = '';
    addForm.classList.add('hidden');
  });

  nextBtn?.addEventListener('click', () => {
    const n    = BT.players.length;
    const dIdx = BT.players.findIndex(p => p.dealer);
    BT.players.forEach(p => { p.dealer = false; p.sb = false; p.bb = false; p.folded = false; p.action = null; });
    const newD = dIdx < 0 ? 0 : (dIdx + 1) % n;
    BT.players[newD].dealer             = true;
    BT.players[(newD + 1) % n].sb       = true;
    BT.players[(newD + 2) % n].bb       = true;
    renderBlindTracker();
  });

  renderBlindTracker();
}

// ── Boot ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPlayersFromStorage();
  populateSelects();
  setupSuitPickers();
  document.getElementById('analyze-btn').addEventListener('click', analyze);
  setupActionButtons();
  setupPreFlopWizard();
  setupBlindTracker();
  document.getElementById('sbt-ai-btn')?.addEventListener('click', sbtAdvice);
  document.getElementById('sbt-apply-btn')?.addEventListener('click', sbtApply);
  document.getElementById('sbt-reset-btn')?.addEventListener('click', () =>
    initSBT(SBT.street || 'flop', parseFloat(document.getElementById('pot-size').value) || 0)
  );
  document.getElementById('lb-new-game')?.addEventListener('click', () => {
    if (!confirm('Reset the leaderboard? Player names will be kept.')) return;
    BT.players.forEach(p => { p.wins = 0; p.folded = false; p.action = null; });
    savePlayersToStorage();
    renderLeaderboard();
    renderBlindTracker();
  });
});
