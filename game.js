(() => {
  const $ = (id) => document.getElementById(id);
  const SAVE_KEY = 'ember-iron-save-v1';
  const tiers = ['common', 'uncommon', 'rare', 'epic'];
  const tierNames = ['Common', 'Uncommon', 'Rare', 'Epic'];
  const tierBonus = [0, 4, 8, 14];
  const defaults = {
    gold: 120, ore: 8, essence: 0, level: 1, day: 1, victories: 0, salvaged: 0,
    weaponLevel: 0, rarity: 0, weaponName: 'Cinderbound', quality: 'Rough',
    loot: [], forged: false, lastWin: false, questDone: false
  };
  let state;
  try { state = { ...defaults, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; }
  catch { state = { ...defaults }; }
  let forgeActive = false, strikeCount = 0, strikeQuality = [], markerPos = 0, markerDirection = 1, rafId = 0, toastTimer;
  let battleBusy = false, battleOver = false, guarding = false, focus = 0, enemyIndex = 0;
  const enemies = [
    { name: 'THE PIT KNAVE', hp: 42, attack: 9, loot: 'Knave’s Notched Dirk', rank: 'COMMON' },
    { name: 'MARA THE RED', hp: 56, attack: 11, loot: 'Mara’s Bloodied Buckler', rank: 'UNCOMMON' },
    { name: 'THE ASHEN DUELIST', hp: 68, attack: 13, loot: 'Ashen Duelist’s Edge', rank: 'RARE' },
    { name: 'GARRON IRONJAW', hp: 82, attack: 15, loot: 'Ironjaw’s Warhammer', rank: 'RARE' },
    { name: 'THE CROWNLESS', hp: 104, attack: 18, loot: 'Crownless Sovereign’s Blade', rank: 'EPIC' }
  ];
  let playerHp = 100, enemyHp = 42, enemy = enemies[0];

  function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  function attackPower() { return 12 + state.weaponLevel * 3 + tierBonus[state.rarity]; }
  function critChance() { return Math.min(42, 8 + state.weaponLevel * 2 + state.rarity * 5); }
  function render() {
    $('gold-count').textContent = state.gold; $('ore-count').textContent = state.ore; $('essence-count').textContent = state.essence;
    $('rack-gold').textContent = state.gold; $('rack-ore').textContent = state.ore; $('rack-essence').textContent = state.essence; $('essence-total').textContent = state.essence;
    $('player-level').textContent = state.level; $('day-count').textContent = String(state.day).padStart(2, '0');
    $('victory-count').textContent = String(state.victories).padStart(2, '0'); $('salvage-count').textContent = String(state.salvaged).padStart(2, '0');
    $('weapon-level').textContent = state.weaponLevel; $('attack-stat').textContent = attackPower(); $('crit-stat').innerHTML = `${critChance()}<small>%</small>`;
    $('quality-stat').textContent = state.quality; $('weapon-name').textContent = state.weaponName;
    const rarity = $('weapon-rarity'); rarity.textContent = tierNames[state.rarity].toUpperCase(); rarity.className = `rarity-pill ${tiers[state.rarity]}`;
    $('start-forge').disabled = forgeActive || state.ore < 3;
    $('rarity-upgrade').disabled = state.rarity >= 3 || state.essence < [3, 6, 10][state.rarity];
    $('rack-ore').textContent = state.ore;
    const questDone = state.victories > 0 && state.forged;
    $('quest-title').textContent = questDone ? 'A Smith’s Oath' : state.forged ? 'The Arena Awaits' : 'A Blade Worthy';
    $('quest-copy').textContent = questDone ? 'Forge, fight, reclaim. A legend takes shape.' : state.forged ? 'Your blade is ready. Prove it in the arena.' : 'Forge your first upgrade, then enter the arena.';
    $('quest-progress').style.width = questDone ? '100%' : state.forged ? '55%' : '12%';
    $('inventory-count').textContent = `${state.loot.length} ITEM${state.loot.length === 1 ? '' : 'S'}`;
    drawLoot(); updateButtons(); save();
  }
  function updateButtons() {
    const disabled = battleBusy || battleOver;
    $('attack-button').disabled = disabled; $('guard-button').disabled = disabled; $('heavy-button').disabled = disabled || focus < 8;
  }
  function drawLoot() {
    const list = $('loot-list'); list.innerHTML = '';
    if (!state.loot.length) {
      list.innerHTML = '<div class="empty-loot"><span>♜</span>The scrapyard is quiet for now.<br>Win a bout to bring home fallen gear.</div>';
      return;
    }
    state.loot.forEach((item, index) => {
      const card = document.createElement('div'); card.className = `loot-card ${tiers[item.rarity] || 'common'}`;
      const icon = item.kind === 'shield' ? '⬡' : item.kind === 'hammer' ? '⚒' : '⚔';
      card.innerHTML = `<span class="loot-icon">${icon}</span><span class="loot-copy"><b></b><small><em>${tierNames[item.rarity] || 'Common'}</em> · ${item.kind === 'shield' ? 'ARMOR' : item.kind === 'hammer' ? 'HEAVY WEAPON' : 'WEAPON'} · ${item.attack} ATK</small></span><button class="button salvage-button" data-salvage="${index}">Salvage <span>✧ ${item.essence}</span></button>`;
      card.querySelector('.loot-copy b').textContent = item.name;
      list.appendChild(card);
    });
    list.querySelectorAll('[data-salvage]').forEach(button => button.addEventListener('click', () => salvage(Number(button.dataset.salvage))));
  }
  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active-view', v.id === `${name}-view`));
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'arena') prepareArena();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  document.querySelectorAll('[data-go-forge]').forEach(b => b.addEventListener('click', () => showView('forge')));

  function startForge() {
    if (forgeActive || state.ore < 3) { toast(state.ore < 3 ? 'You need 3 iron ore to forge.' : 'Finish your current forging first.'); return; }
    state.ore -= 3; forgeActive = true; strikeCount = 0; strikeQuality = []; markerPos = 0; markerDirection = 1;
    $('forge-result').textContent = 'Listen for the ring of true steel.'; $('mini-copy').innerHTML = 'Strike inside the <b>golden zone</b> for the strongest temper.';
    $('round-count').textContent = 'STRIKE 1 / 3'; $('strike-button').disabled = false; $('timing-wrap').classList.add('active'); $('start-forge').disabled = true;
    $('strike-results').querySelectorAll('i').forEach(x => x.className = ''); render(); animateMarker();
  }
  function animateMarker() {
    if (!forgeActive) return;
    markerPos += markerDirection * 0.62;
    if (markerPos >= 100) { markerPos = 100; markerDirection = -1; }
    if (markerPos <= 0) { markerPos = 0; markerDirection = 1; }
    $('timing-marker').style.left = `${markerPos}%`;
    rafId = requestAnimationFrame(animateMarker);
  }
  function strike() {
    if (!forgeActive) return;
    const distance = Math.abs(markerPos - 50);
    let quality = distance < 7 ? 'perfect' : distance < 19 ? 'good' : 'bad';
    strikeQuality.push(quality); $('strike-results').children[strikeCount].className = quality;
    strikeCount++; $('round-count').textContent = strikeCount < 3 ? `STRIKE ${strikeCount + 1} / 3` : 'TEMPERING';
    $('forge-result').textContent = quality === 'perfect' ? 'A perfect ring! The steel sings.' : quality === 'good' ? 'A clean strike. Good, steady work.' : 'The hammer glances wide. Regain your rhythm.';
    const main = document.querySelector('.forge-main'); main.classList.remove('is-striking'); void main.offsetWidth; main.classList.add('is-striking'); setTimeout(() => main.classList.remove('is-striking'), 300);
    if (strikeCount >= 3) finishForge();
  }
  function finishForge() {
    forgeActive = false; cancelAnimationFrame(rafId); $('timing-wrap').classList.remove('active'); $('strike-button').disabled = true;
    const score = strikeQuality.reduce((sum, q) => sum + (q === 'perfect' ? 2 : q === 'good' ? 1 : 0), 0);
    const failureChance = Math.max(5, 28 - score * 7);
    const roll = Math.random() * 100;
    state.forged = true;
    if (roll < failureChance) {
      state.quality = 'Scorched'; $('forge-result').textContent = 'The temper broke! The ore is spent, but every smith learns.';
      toast('Forge failed. The next strike could be your masterpiece.');
    } else {
      const epicChance = score >= 5 ? 13 : score >= 3 ? 5 : 1;
      const rareChance = score >= 4 ? 25 : 12;
      const qualityRoll = Math.random() * 100;
      const generatedTier = qualityRoll < epicChance ? 3 : qualityRoll < epicChance + rareChance ? 2 : qualityRoll < epicChance + rareChance + 35 ? 1 : 0;
      state.rarity = Math.max(state.rarity, generatedTier);
      if (state.rarity === 3) { state.quality = 'Masterwork'; state.weaponName = 'Emberwake'; }
      else if (state.rarity === 2) { state.quality = 'Fine'; state.weaponName = 'Ashen Promise'; }
      else if (state.rarity === 1) { state.quality = generatedTier === 1 ? 'Tempered' : 'Steady'; state.weaponName = 'Cinderbound'; }
      else { state.quality = score >= 3 ? 'Steady' : 'Rough'; state.weaponName = 'Cinderbound'; }
      state.weaponLevel++; state.gold += 8 + score * 3; $('forge-result').textContent = `${state.quality}! +${score >= 4 ? 'strong ' : ''}steel · +${8 + score * 3} gold`;
      toast(`${state.quality} forge! Your blade grows stronger.`);
    }
    state.day++; $('round-count').textContent = 'READY'; $('mini-copy').innerHTML = 'Three strikes shape the steel.<br>Time each one with care.'; render();
  }
  $('start-forge').addEventListener('click', startForge); $('strike-button').addEventListener('click', strike);
  document.addEventListener('keydown', e => { if ((e.code === 'Space' || e.code === 'Enter') && forgeActive && document.activeElement !== $('strike-button')) { e.preventDefault(); strike(); } });

  $('rarity-upgrade').addEventListener('click', () => {
    if (state.rarity >= 3) return toast('This weapon has reached its highest rarity.');
    const cost = [3, 6, 10][state.rarity];
    if (state.essence < cost) return toast(`You need ${cost} essence. Salvage arena loot to collect more.`);
    state.essence -= cost; state.rarity++; state.quality = tierNames[state.rarity];
    state.weaponName = ['Cinderbound', 'Emberforged', 'Dawnbreaker', 'The Last Ember'][state.rarity];
    toast(`${tierNames[state.rarity]} rarity unlocked! Attack +${tierBonus[state.rarity]}.`); render();
  });

  function prepareArena() {
    if (battleBusy) return;
    enemyIndex = Math.min(state.victories, enemies.length - 1); enemy = enemies[enemyIndex];
    enemyHp = enemy.hp + Math.max(0, state.victories - (enemies.length - 1)) * 10;
    playerHp = 100; focus = 0; guarding = false; battleOver = false;
    $('enemy-name').textContent = enemy.name; $('enemy-label').textContent = enemy.name; $('enemy-hp').textContent = enemyHp;
    $('enemy-health-fill').style.width = '100%'; $('player-hp').textContent = playerHp; $('player-health-fill').style.width = '100%';
    $('arena-round').textContent = `BOUT ${String(state.victories + 1).padStart(2, '0')}  ·  ${enemyIndex < 2 ? 'BRONZE' : enemyIndex < 4 ? 'SILVER' : 'GOLD'} CIRCUIT`;
    $('battle-log').innerHTML = `<span class="log-mark">✦</span><span> The gates open. ${enemy.name[0] + enemy.name.slice(1).toLowerCase()} raises a weapon.</span>`;
    $('turn-indicator').innerHTML = 'YOUR TURN <span>◆</span>'; updateButtons();
  }
  function log(message) { $('battle-log').innerHTML = `<span class="log-mark">✦</span><span> ${message}</span>`; }
  function updateHealth() {
    $('player-hp').textContent = Math.max(0, playerHp); $('enemy-hp').textContent = Math.max(0, enemyHp);
    $('player-health-fill').style.width = `${Math.max(0, playerHp)}%`; $('enemy-health-fill').style.width = `${Math.max(0, enemyHp / (enemy.hp + Math.max(0, state.victories - (enemies.length - 1)) * 10) * 100)}%`;
  }
  function animateHit(who) {
    const target = document.querySelector(who === 'player' ? '.player-combatant' : '.enemy-combatant');
    target.classList.remove('hit'); void target.offsetWidth; target.classList.add('hit');
    $('combat-flash').classList.remove('flash'); void $('combat-flash').offsetWidth; $('combat-flash').classList.add('flash');
  }
  function playerAction(kind) {
    if (battleBusy || battleOver) return;
    battleBusy = true; guarding = kind === 'guard';
    if (kind === 'attack') {
      const critical = Math.random() * 100 < critChance();
      const damage = Math.round(attackPower() * (critical ? 1.65 : .9 + Math.random() * .25));
      enemyHp -= damage; focus = Math.min(8, focus + 3); log(`${critical ? 'Critical strike!' : 'You strike'} for ${damage} damage. ${focus >= 8 ? 'Heavy strike ready.' : `Focus ${focus}/8.`}`); animateHit('enemy');
    } else if (kind === 'heavy') {
      if (focus < 8) { battleBusy = false; return toast('Build 8 focus with regular attacks first.'); }
      focus = 0; const damage = Math.round(attackPower() * 1.75); enemyHp -= damage; log(`Your heavy strike crashes home for ${damage} damage!`); animateHit('enemy');
    } else {
      focus = Math.min(8, focus + 2); log('You set your stance and brace for the counterattack. Damage reduced.');
    }
    updateHealth(); updateButtons();
    if (enemyHp <= 0) { setTimeout(winBattle, 420); return; }
    $('turn-indicator').innerHTML = 'ENEMY TURN <span>◆</span>';
    setTimeout(enemyTurn, 700);
  }
  function enemyTurn() {
    if (battleOver) return;
    const damage = Math.max(2, enemy.attack + Math.floor(Math.random() * 5) - (state.rarity > 1 ? 1 : 0));
    const taken = guarding ? Math.ceil(damage * .28) : damage;
    playerHp -= taken; guarding = false; animateHit('player'); updateHealth();
    log(`${enemy.name[0] + enemy.name.slice(1).toLowerCase()} ${Math.random() < .5 ? 'slashes' : 'lunges'} for ${taken} damage${taken < damage ? ' — your guard holds.' : '.'}`);
    if (playerHp <= 0) {
      battleOver = true; battleBusy = false; playerHp = 0; updateHealth(); $('turn-indicator').innerHTML = 'BOUT LOST <span>◆</span>';
      log('You yield the bout. Rest up, then return to the arena.'); toast('Defeat. Your gear is safe — try again when ready.'); updateButtons();
    } else {
      $('turn-indicator').innerHTML = 'YOUR TURN <span>◆</span>'; battleBusy = false; updateButtons();
    }
  }
  function winBattle() {
    battleOver = true; battleBusy = false; state.victories++; state.gold += 24 + enemyIndex * 12; state.ore += 2 + Math.floor(enemyIndex / 2); state.level = 1 + Math.floor(state.victories / 2);
    const rarity = Math.min(3, Math.floor(Math.random() * 3) + (enemyIndex > 1 ? 1 : 0));
    const names = [enemy.loot, 'Arena victor’s iron', 'Duelist’s polished steel', 'Crown-forged trophy'];
    const kind = enemy.loot.toLowerCase().includes('buckler') ? 'shield' : enemy.loot.toLowerCase().includes('hammer') ? 'hammer' : 'sword';
    state.loot.push({ name: names[rarity], rarity, kind, attack: 4 + rarity * 3 + enemyIndex, essence: 1 + rarity * 2 });
    $('turn-indicator').innerHTML = 'VICTORY <span>✦</span>'; log(`${enemy.name[0] + enemy.name.slice(1).toLowerCase()} falls! You claim gold, ore, and their gear.`);
    toast(`Victory! +${24 + enemyIndex * 12} gold · fallen gear recovered.`); render(); updateButtons();
  }
  $('attack-button').addEventListener('click', () => playerAction('attack'));
  $('guard-button').addEventListener('click', () => playerAction('guard'));
  $('heavy-button').addEventListener('click', () => playerAction('heavy'));

  function salvage(index) {
    const item = state.loot[index]; if (!item) return;
    state.essence += item.essence; state.loot.splice(index, 1); state.salvaged++; render();
    toast(`Salvaged for ${item.essence} ember essence.`);
  }
  $('sound-toggle').addEventListener('click', () => toast('The forge is quiet for now.'));
  render(); prepareArena();
})();
