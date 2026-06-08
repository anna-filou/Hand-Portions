/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let state = {
  target: null,       // daily kcal target
  handSize: 'average',
  portions: {         // kcal per portion by hand size
    small:   { protein: 130, veggie: 25, carb: 110, fat: 90 },
    average: { protein: 138, veggie: 25, carb: 115, fat: 95 },
    big:     { protein: 145, veggie: 25, carb: 120, fat: 100 }
  },
  macroG: {           // grams per portion (midpoint M/F values)
    small:   { protein_p: 22,  veggie_p:  6.5, carb_p: 22,  fat_p: 10.5 },
    average: { protein_p: 23,  veggie_p:  6.5, carb_p: 23.5,fat_p: 11 },
    big:     { protein_p: 24,  veggie_p:  6.5, carb_p: 25,  fat_p: 11.5 }
  },
  counts: { protein: 0, veggie: 0, carb: 0, fat: 0 },
  meals: [],
  goalMult: 1.0,
  profile: {
    weight: '',
    height: '',
    age: '',
    bodyfat: '',
    activity: '1.55'
  }
};

const STORAGE_KEY = 'handful-state-v1';
const PORTION_TYPES = ['protein', 'veggie', 'carb', 'fat'];
const HAND_SIZES = ['small', 'average', 'big'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanCounts(counts) {
  return PORTION_TYPES.reduce((nextCounts, type) => {
    const count = Number(counts && counts[type]);
    nextCounts[type] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    return nextCounts;
  }, {});
}

function cleanMeals(meals) {
  if (!Array.isArray(meals)) return [];

  return meals
    .filter((meal) => isObject(meal) && Number.isFinite(Number(meal.timestamp)))
    .map((meal) => ({
      timestamp: Number(meal.timestamp),
      portions: cleanCounts(meal.portions),
      kcal: Number.isFinite(Number(meal.kcal)) ? Number(meal.kcal) : 0,
      macroG: isObject(meal.macroG) ? meal.macroG : {}
    }));
}

function loadState() {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) return;

    const savedState = JSON.parse(rawState);
    if (!isObject(savedState)) return;

    const target = Number(savedState.target);
    const goalMult = Number(savedState.goalMult);
    const weight = Number(savedState.weight);

    state = {
      ...state,
      target: Number.isFinite(target) && target > 0 ? target : null,
      handSize: HAND_SIZES.includes(savedState.handSize) ? savedState.handSize : state.handSize,
      counts: cleanCounts(savedState.counts),
      meals: cleanMeals(savedState.meals),
      goalMult: Number.isFinite(goalMult) && goalMult > 0 ? goalMult : state.goalMult,
      weight: Number.isFinite(weight) && weight > 0 ? weight : undefined,
      profile: {
        ...state.profile,
        ...(isObject(savedState.profile) ? savedState.profile : {})
      }
    };
  } catch (error) {
    console.warn('Unable to load saved Handful state.', error);
  }
}

function saveState() {
  try {
    const persistentState = {
      target: state.target,
      handSize: state.handSize,
      counts: state.counts,
      meals: state.meals,
      goalMult: state.goalMult,
      weight: state.weight,
      profile: state.profile
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistentState));
  } catch (error) {
    console.warn('Unable to save Handful state.', error);
  }
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('section-' + tab).classList.add('active');
  const tabs = ['today', 'log', 'setup'];
  document.querySelectorAll('.tab')[tabs.indexOf(tab)].classList.add('active');

  if (tab === 'today') renderToday();
  if (tab === 'log') updateLogUI();
}

function handleAppClick(event) {
  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    switchTab(tabButton.dataset.tab);
    return;
  }

  const goalButton = event.target.closest('.goal-option');
  if (goalButton) {
    selectGoal(goalButton);
    return;
  }

  const handButton = event.target.closest('.toggle-option');
  if (handButton) {
    selectHand(handButton);
    return;
  }

  const countButton = event.target.closest('[data-count-type]');
  if (countButton) {
    changeCount(countButton.dataset.countType, Number(countButton.dataset.countDelta));
    return;
  }

  const heavyChoice = event.target.closest('[data-heavy-choice]');
  if (heavyChoice) {
    confirmHeavy(heavyChoice.dataset.heavyChoice);
    return;
  }

  const lightChoice = event.target.closest('[data-light-choice]');
  if (lightChoice) {
    confirmLight(lightChoice.dataset.lightChoice);
    return;
  }

  const dairyChoice = event.target.closest('[data-dairy-choice]');
  if (dairyChoice) {
    confirmDairy(dairyChoice.dataset.dairyChoice);
    return;
  }

  const deleteMealButton = event.target.closest('[data-delete-meal-index]');
  if (deleteMealButton) {
    deleteMeal(Number(deleteMealButton.dataset.deleteMealIndex));
    return;
  }

  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    runAction(actionButton.dataset.action);
    return;
  }

  if (event.target.classList.contains('popup-overlay')) {
    closePopup(event.target.dataset.popup);
  }
}

function runAction(action) {
  const actions = {
    'use-demo': useDemoValues,
    'calculate-target': calculateTarget,
    'quick-add-processed': quickAddProcessed,
    'open-light-popup': openLightPopup,
    'open-heavy-popup': openHeavyPopup,
    'open-dairy-popup': openDairyPopup,
    'quick-add-soda': quickAddSoda,
    'log-meal': logMeal,
    'reset-counts': resetCounts,
    'reset-day': resetDay,
    'close-heavy-popup': closeHeavyPopup,
    'close-light-popup': closeLightPopup,
    'close-dairy-popup': closeDairyPopup
  };

  if (actions[action]) actions[action]();
}

/* ══════════════════════════════════════════
   SETUP
══════════════════════════════════════════ */
function selectGoal(el) {
  document.querySelectorAll('.goal-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  state.goalMult = parseFloat(el.dataset.mult);
  saveState();
  if (document.getElementById('section-today').classList.contains('active')) renderToday();
}

function selectHand(el) {
  document.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  state.handSize = el.dataset.hand;
  updatePortionKcals();
  updateMealTotal();
  saveState();
  if (document.getElementById('section-today').classList.contains('active')) renderToday();
}

// Update formula display hint
const bfInput = document.getElementById('bodyfat');
const weightInput = document.getElementById('weight');
const heightInput = document.getElementById('height');
const ageInput = document.getElementById('age');

[weightInput, heightInput, ageInput, bfInput].forEach(el => {
  el.addEventListener('input', updateFormulaNote);
});

function updateFormulaNote() {
  const bf = parseFloat(bfInput.value);
  const note = document.getElementById('formula-display');
  if (!isNaN(bf) && bf > 0) {
    note.textContent = 'Formula: Katch-McArdle (lean mass) — most accurate when body fat is known.';
  } else {
    note.textContent = 'Formula: Mifflin-St Péter neutral (no sex input) — body fat % would improve accuracy.';
  }
}

function calculateTarget() {
  const weight = parseFloat(document.getElementById('weight').value);
  const height = parseFloat(document.getElementById('height').value);
  const age    = parseFloat(document.getElementById('age').value);
  const bf     = parseFloat(document.getElementById('bodyfat').value);
  const activity = parseFloat(document.getElementById('activity').value);
  const errEl = document.getElementById('setup-error');

  errEl.style.display = 'none';

  if (isNaN(weight) || isNaN(height) || isNaN(age)) {
    errEl.textContent = 'Please fill in weight, height, and age.';
    errEl.style.display = 'block';
    return;
  }
  if (weight < 30 || weight > 300) { errEl.textContent = 'Weight must be between 30–300 kg.'; errEl.style.display='block'; return; }
  if (height < 120 || height > 250) { errEl.textContent = 'Height must be between 120–250 cm.'; errEl.style.display='block'; return; }
  if (age < 15 || age > 100) { errEl.textContent = 'Age must be between 15–100.'; errEl.style.display='block'; return; }

  let bmr;
  if (!isNaN(bf) && bf >= 5 && bf <= 60) {
    // Katch-McArdle: BMR = 370 + (21.6 × LBM in kg)
    const lbm = weight * (1 - bf / 100);
    bmr = 370 + 21.6 * lbm;
  } else {
    // Neutral Mifflin variant: use average of male/female Mifflin constants (5 and -161 → average -78)
    // Male: 10w + 6.25h - 5a + 5 | Female: 10w + 6.25h - 5a - 161
    // Average: 10w + 6.25h - 5a - 78
    bmr = 10 * weight + 6.25 * height - 5 * age - 78;
  }

  const tdee = bmr * activity * state.goalMult;
  state.target = Math.round(tdee);
  state.weight = weight;
  state.profile = {
    weight,
    height,
    age,
    bodyfat: !isNaN(bf) && bf >= 5 && bf <= 60 ? bf : '',
    activity: String(activity)
  };
  saveState();

  switchTab('today');
  renderToday();
}

/* ══════════════════════════════════════════
   LOG MEAL
══════════════════════════════════════════ */
function updateLogUI() {
  const noTarget = document.getElementById('no-target-msg');
  const logContent = document.getElementById('log-content');
  if (!state.target) {
    noTarget.style.display = 'block';
    logContent.style.display = 'none';
  } else {
    noTarget.style.display = 'none';
    logContent.style.display = 'block';
    updatePortionKcals();
    updateMealTotal();
  }
}

function updatePortionKcals() {
  const p = state.portions[state.handSize];
  const types = ['protein', 'veggie', 'carb', 'fat'];
  types.forEach(t => {
    const c = state.counts[t];
    document.getElementById(t + '-kcal').textContent = (c * p[t]) + ' kcal';
  });
}

function changeCount(type, delta) {
  state.counts[type] = Math.max(0, state.counts[type] + delta);
  document.getElementById('count-' + type).textContent = state.counts[type];
  updatePortionKcals();
  updateMealTotal();
  saveState();
}

function updateMealTotal() {
  const p = state.portions[state.handSize];
  const total = state.counts.protein * p.protein
    + state.counts.veggie * p.veggie
    + state.counts.carb * p.carb
    + state.counts.fat * p.fat;
  document.getElementById('meal-total').textContent = total + ' kcal';
}

function resetCounts() {
  ['protein','veggie','carb','fat'].forEach(t => {
    state.counts[t] = 0;
    document.getElementById('count-' + t).textContent = '0';
  });
  updatePortionKcals();
  updateMealTotal();
  saveState();
}

function logMeal() {
  const total = state.counts.protein + state.counts.veggie + state.counts.carb + state.counts.fat;
  if (total === 0) return;

  const p = state.portions[state.handSize];
  const g = state.macroG[state.handSize];
  const kcal = state.counts.protein * p.protein
    + state.counts.veggie * p.veggie
    + state.counts.carb * p.carb
    + state.counts.fat * p.fat;

  const meal = {
    timestamp: Date.now(),
    portions: { ...state.counts },
    kcal,
    macroG: {
      protein: Math.round(state.counts.protein * g.protein_p),
      veggie: Math.round(state.counts.veggie * g.veggie_p),
      carb: Math.round(state.counts.carb * g.carb_p),
      fat: Math.round(state.counts.fat * g.fat_p)
    }
  };

  state.meals.push(meal);
  saveState();
  resetCounts();
  switchTab('today');
}

/* ══════════════════════════════════════════
   GOAL PORTIONS
══════════════════════════════════════════ */
function calcGoalPortions(weight, goalMult, targetKcal, handSize) {
  var p = {
    small:   { protein: 130, veggie: 25, carb: 110, fat: 90 },
    average: { protein: 138, veggie: 25, carb: 115, fat: 95 },
    big:     { protein: 145, veggie: 25, carb: 120, fat: 100 }
  }[handSize || 'average'];

  // Veggies scale with weight — always eat them, subtract from budget first
  var veggie = Math.max(3, Math.round(weight / 13.5));
  var remaining = targetKcal - veggie * p.veggie;

  // Macro split ratios by goal
  // Calibrated so portion counts come out balanced (fat portions are cheaper
  // kcal-wise than carb portions, so fat% must be kept lower to equalise counts)
  var split;
  if (goalMult <= 0.85) {
    // Lose: higher protein, moderate carb, moderate fat
    split = { protein: 0.43, carb: 0.26, fat: 0.31 };
  } else if (goalMult >= 1.05) {
    // Gain: more carbs, moderate protein, moderate fat
    split = { protein: 0.30, carb: 0.42, fat: 0.28 };
  } else {
    // Maintain: balanced
    split = { protein: 0.35, carb: 0.33, fat: 0.32 };
  }

  // Floor each macro (never round up — that's what caused overshoot)
  var protein = Math.max(1, Math.floor((remaining * split.protein) / p.protein));
  var carb    = Math.max(1, Math.floor((remaining * split.carb)    / p.carb));
  var fat     = Math.max(1, Math.floor((remaining * split.fat)     / p.fat));

  // Protein floor from weight
  var proteinMin = Math.round(weight * 0.056);
  if (protein < proteinMin) protein = proteinMin;

  // Top-up: keep adding portions while they get us closer to target.
  // Allow going slightly over (by at most the cheapest portion cost) since
  // whole-number portions can't always land exactly on the target.
  var used = protein * p.protein + veggie * p.veggie + carb * p.carb + fat * p.fat;
  var budget = targetKcal - used;
  var minCost = Math.min(p.protein, p.carb, p.fat);
  var result = { protein: protein, veggie: veggie, carb: carb, fat: fat };

  // Keep looping while there's at least half a portion's worth of budget left
  var keepGoing = true;
  while (keepGoing) {
    keepGoing = false;
    var candidates = [
      { key: 'protein', cost: p.protein },
      { key: 'carb',    cost: p.carb    },
      { key: 'fat',     cost: p.fat     }
    ];
    // Sort by how close each addition gets us to zero remaining budget
    candidates.sort(function(a, b) {
      return Math.abs(budget - a.cost) - Math.abs(budget - b.cost);
    });
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      // Accept if it fits, or if it overshoots by less than half a portion
      var overshoot = c.cost - budget;
      if (overshoot <= minCost * 0.6) {
        result[c.key] += 1;
        budget -= c.cost;
        keepGoing = true;
        break;
      }
    }
  }

  return result;
}

/* ══════════════════════════════════════════
   TODAY
══════════════════════════════════════════ */
function renderToday() {
  const noTarget = document.getElementById('today-no-target');
  const content = document.getElementById('today-content');

  if (!state.target) {
    noTarget.style.display = 'block';
    content.style.display = 'none';
    return;
  }

  noTarget.style.display = 'none';
  content.style.display = 'block';

  // Date
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('today-date-str').textContent =
    `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  document.getElementById('today-day-str').textContent = 'Today';

  // Filter today's meals
  const todayStr = now.toDateString();
  const todayMeals = state.meals.filter(m => new Date(m.timestamp).toDateString() === todayStr);

  // Totals
  let totalKcal = 0;
  let portionP = 0, portionV = 0, portionC = 0, portionFt = 0;

  todayMeals.forEach(m => {
    totalKcal += m.kcal;
    portionP  += m.portions.protein;
    portionV  += m.portions.veggie;
    portionC  += m.portions.carb;
    portionFt += m.portions.fat;
  });

  // Progress — show target as a ±5% range (hand portions are ~95% accurate)
  const rangeLo = Math.round(state.target * 0.95);
  const rangeHi = Math.round(state.target * 1.05);
  const pct = Math.min(100, Math.round((totalKcal / rangeHi) * 100));
  const fill = document.getElementById('prog-fill');

  document.getElementById('prog-consumed').textContent = totalKcal;
  document.getElementById('prog-total').textContent = rangeLo + '–' + rangeHi;
  fill.style.width = pct + '%';

  const remEl = document.getElementById('prog-remaining');
  if (totalKcal < rangeLo) {
    const rem = rangeLo - totalKcal;
    remEl.textContent = rem + ' kcal below range';
    remEl.classList.remove('over');
    fill.classList.remove('over');
  } else if (totalKcal <= rangeHi) {
    remEl.textContent = '✓ within range';
    remEl.classList.remove('over');
    fill.classList.remove('over');
  } else {
    remEl.textContent = (totalKcal - rangeHi) + ' kcal over range';
    remEl.classList.add('over');
    fill.classList.add('over');
  }

  // Portion targets
  var goals = calcGoalPortions(state.weight || 70, state.goalMult, state.target, state.handSize);
  const rows = [
    { key: 'protein', icon: '🥩', label: 'Protein', sub: 'palms', logged: portionP, target: goals.protein },
    { key: 'veggie', icon: '🥦', label: 'Veggies', sub: 'fists',  logged: portionV,  target: goals.veggie },
    { key: 'carb', icon: '🌾', label: 'Carbs', sub: 'handfuls', logged: portionC, target: goals.carb },
    { key: 'fat', icon: '🥑', label: 'Fats',    sub: 'thumbs', logged: portionFt, target: goals.fat },
  ];
  const ptContainer = document.getElementById('portion-targets');
  ptContainer.innerHTML = '';
  rows.forEach(function(r) {
    var met  = r.logged >= r.target;
    var over = r.logged > r.target;
    var cls  = over ? 'over' : (met ? 'met' : '');
    var div = document.createElement('div');
    div.className = 'pt-card';
    div.innerHTML =
      '<div class="pt-icon">' + r.icon + '</div>' +
      '<div class="pt-label">' + r.label + '</div>' +
      '<div class="pt-portions ' + r.key + ' ' + cls + '">' + r.logged + '/' + r.target + ' ' + r.sub + '</div>';
    ptContainer.appendChild(div);
  });

  // Meal list
  const list = document.getElementById('meal-list');
  if (todayMeals.length === 0) {
    list.innerHTML = '<div class="empty-state"><div class="icon">🍽</div><div>No meals logged yet today.</div></div>';
    return;
  }

  list.innerHTML = '';
  todayMeals.forEach(function(m, i) {
    var time = new Date(m.timestamp);
    var hh = String(time.getHours()).padStart(2,'0');
    var mm = String(time.getMinutes()).padStart(2,'0');

    var icons = { protein: '🥩', veggie: '🥦', carb: '🌾', fat: '🥑' };
    var emojiStr = '';
    ['protein','veggie','carb','fat'].forEach(function(k) {
      var n = m.portions[k];
      if (n > 0) emojiStr += (emojiStr ? ' ' : '') + icons[k].repeat(n);
    });

    var entry = document.createElement('div');
    entry.className = 'meal-entry';

    var left = document.createElement('div');

    var timeEl = document.createElement('div');
    timeEl.className = 'meal-entry-time';
    timeEl.textContent = hh + ':' + mm;

    var portionsEl = document.createElement('div');
    portionsEl.className = 'meal-entry-portions';
    portionsEl.textContent = emojiStr;

    left.appendChild(timeEl);
    left.appendChild(portionsEl);

    var kcalEl = document.createElement('div');
    kcalEl.className = 'meal-entry-kcal';
    kcalEl.textContent = m.kcal + ' kcal';

    var delBtn = document.createElement('button');
    delBtn.className = 'meal-delete';
    delBtn.title = 'Delete';
    delBtn.textContent = '✕';
    delBtn.dataset.deleteMealIndex = i;

    entry.appendChild(left);
    entry.appendChild(kcalEl);
    entry.appendChild(delBtn);
    list.appendChild(entry);
  });
}

function deleteMeal(index) {
  // Find actual index in state.meals for today
  const todayStr = new Date().toDateString();
  const todayMeals = state.meals.filter(m => new Date(m.timestamp).toDateString() === todayStr);
  const toDelete = todayMeals[index];
  state.meals = state.meals.filter(m => m !== toDelete);
  saveState();
  renderToday();
}

function resetDay() {
  const todayStr = new Date().toDateString();
  state.meals = state.meals.filter(m => new Date(m.timestamp).toDateString() !== todayStr);
  saveState();
  renderToday();
}

/* ══════════════════════════════════════════
   QUICK-ADD
══════════════════════════════════════════ */
var drinkTypes = { light: 'carb', heavy: '2carb' };

// (legacy — no longer used in UI but kept for safety)
function setDrinkType(size, type) {}

function setPopupOpen(name, isOpen) {
  const popup = document.getElementById(name + '-popup-overlay');
  if (popup) popup.classList.toggle('open', isOpen);
}

function closePopup(name) {
  setPopupOpen(name, false);
}

function openHeavyPopup() {
  setPopupOpen('heavy', true);
}

function closeHeavyPopup() {
  closePopup('heavy');
}

function confirmHeavy(type) {
  closeHeavyPopup();
  if (type === '2carb') {
    changeCount('carb', 2); bumpEl('count-carb');
  } else if (type === '2fat') {
    changeCount('fat', 2); bumpEl('count-fat');
  } else {
    changeCount('carb', 1); changeCount('fat', 1);
    bumpEl('count-carb'); bumpEl('count-fat');
  }
}

function bumpEl(id) {
  var el = document.getElementById(id);
  el.classList.remove('bumped');
  void el.offsetWidth; // reflow to restart animation
  el.classList.add('bumped');
  setTimeout(function() { el.classList.remove('bumped'); }, 300);
}

function quickAddProcessed() {
  changeCount('carb', 1);
  changeCount('fat', 1);
  bumpEl('count-carb');
  bumpEl('count-fat');
}

function quickAddDrink(size) {
  // only light drink uses this now; heavy uses confirmHeavy() via popup
  var type = drinkTypes.light;
  changeCount(type, 1);
  bumpEl('count-' + type);
}

function openLightPopup() {
  setPopupOpen('light', true);
}
function closeLightPopup() {
  closePopup('light');
}
function confirmLight(type) {
  closeLightPopup();
  changeCount(type, 1);
  bumpEl('count-' + type);
}

function openDairyPopup() {
  setPopupOpen('dairy', true);
}
function closeDairyPopup() {
  closePopup('dairy');
}
function confirmDairy(type) {
  closeDairyPopup();
  if (type === 'fat')  { changeCount('fat', 1);  bumpEl('count-fat'); }
  if (type === 'carb') { changeCount('carb', 1); bumpEl('count-carb'); }
  if (type === 'both') { changeCount('fat', 1); changeCount('carb', 1); bumpEl('count-fat'); bumpEl('count-carb'); }
  // 'none' = do nothing
}

function quickAddSoda() {
  changeCount('carb', 1);
  bumpEl('count-carb');
}

/* ══════════════════════════════════════════
   DEMO
══════════════════════════════════════════ */
function useDemoValues() {
  document.getElementById('weight').value = 54;
  document.getElementById('height').value = 160;
  document.getElementById('age').value = 28;
  document.getElementById('bodyfat').value = 23;
  document.getElementById('activity').value = '1.375';

  // Set goal to Lose
  document.querySelectorAll('.goal-option').forEach(el => {
    const isLose = parseFloat(el.dataset.mult) === 0.8;
    el.classList.toggle('selected', isLose);
  });
  state.goalMult = 0.8;

  // Set hand size to small
  document.querySelectorAll('.toggle-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.hand === 'small');
  });
  state.handSize = 'small';
  state.profile = {
    weight: 54,
    height: 160,
    age: 28,
    bodyfat: 23,
    activity: '1.375'
  };

  updateFormulaNote();
  saveState();
}

/* ══════════════════════════════════════════
   INIT
══════════════════════════════════════════ */
function restoreProfileUI() {
  const profile = state.profile || {};
  document.getElementById('weight').value = profile.weight ?? '';
  document.getElementById('height').value = profile.height ?? '';
  document.getElementById('age').value = profile.age ?? '';
  document.getElementById('bodyfat').value = profile.bodyfat ?? '';
  document.getElementById('activity').value = profile.activity || '1.55';
  updateFormulaNote();
}

function restoreCountUI() {
  PORTION_TYPES.forEach((type) => {
    document.getElementById('count-' + type).textContent = state.counts[type];
  });
  updatePortionKcals();
  updateMealTotal();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .catch((error) => console.warn('Service worker registration failed.', error));
  });
}

document.addEventListener('click', handleAppClick);
loadState();
restoreProfileUI();
restoreCountUI();

// Restore hand size UI
if (state.handSize) {
  document.querySelectorAll('.toggle-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.hand === state.handSize);
  });
}

// Restore goal UI
if (state.goalMult) {
  document.querySelectorAll('.goal-option').forEach(el => {
    el.classList.toggle('selected', parseFloat(el.dataset.mult) === state.goalMult);
  });
}

// If target already exists, go to today — otherwise settings
if (state.target) {
  switchTab('today');
} else {
  switchTab('setup');
}

registerServiceWorker();
