/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let state = {
  target: null,       // daily kcal target
  budget: null,       // daily portion budget { protein, veggie, carb, fat }
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
  },
  dynamicRecalc: false,
  targetHistory: []
};

const STORAGE_KEY = 'handful-state-v1';
const EXPORT_FORMAT = 'handful-backup';
const EXPORT_FORMAT_VERSION = 1;
const PORTION_TYPES = ['protein', 'veggie', 'carb', 'fat'];
const DYNAMIC_CUT_ORDER = ['fat', 'protein', 'carb'];
const HAND_SIZES = ['small', 'average', 'big'];
let setupWizardOpen = false;
const historyExpandedDays = new Set();
let todayViewDate = startOfDay(new Date());
let logTargetDay = startOfDay(new Date());

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

function cleanTargetHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(function(entry) {
      return isObject(entry) && typeof entry.dayStr === 'string' && Number.isFinite(Number(entry.target));
    })
    .map(function(entry) {
      return { dayStr: entry.dayStr, target: Math.round(Number(entry.target)) };
    })
    .filter(function(entry) { return entry.target > 0; })
    .sort(function(a, b) { return new Date(a.dayStr) - new Date(b.dayStr); });
}

function getFirstTrackDayStr() {
  if (state.meals.length === 0) return new Date().toDateString();

  let earliest = state.meals[0].timestamp;
  state.meals.forEach(function(meal) {
    if (meal.timestamp < earliest) earliest = meal.timestamp;
  });
  return new Date(earliest).toDateString();
}

function migrateTargetHistory() {
  if (state.targetHistory.length > 0 || !state.target) return;

  ensureBudget();
  const kcal = budgetTotalKcal();
  if (kcal <= 0) return;

  state.targetHistory = [{ dayStr: getFirstTrackDayStr(), target: kcal }];
}

function recordTargetForToday() {
  if (!state.target) return;

  ensureBudget();
  const kcal = budgetTotalKcal();
  if (kcal <= 0) return;

  const dayStr = new Date().toDateString();
  const last = state.targetHistory[state.targetHistory.length - 1];

  if (last && last.dayStr === dayStr) {
    if (last.target === kcal) return;
    last.target = kcal;
    return;
  }

  state.targetHistory.push({ dayStr: dayStr, target: kcal });
}

function getTargetForDay(dayStr) {
  if (state.targetHistory.length === 0) return null;

  const firstDay = state.targetHistory[0].dayStr;
  if (new Date(dayStr) < new Date(firstDay)) return null;

  let target = null;
  state.targetHistory.forEach(function(entry) {
    if (new Date(entry.dayStr) <= new Date(dayStr)) {
      target = entry.target;
    }
  });
  return target;
}

function getPersistentState() {
  return {
    target: state.target,
    budget: state.budget,
    handSize: state.handSize,
    counts: state.counts,
    meals: state.meals,
    goalMult: state.goalMult,
    weight: state.weight,
    profile: state.profile,
    dynamicRecalc: state.dynamicRecalc,
    targetHistory: state.targetHistory
  };
}

function normalizeSavedState(rawState) {
  if (!isObject(rawState)) return null;

  const data = isObject(rawState.data) ? rawState.data : rawState;
  if (!isObject(data)) return null;

  const target = Number(data.target);
  const goalMult = Number(data.goalMult);
  const weight = Number(data.weight);
  const budget = isObject(data.budget) ? cleanCounts(data.budget) : null;
  const hasBudget = budget && PORTION_TYPES.some((type) => budget[type] > 0);

  return {
    target: Number.isFinite(target) && target > 0 ? target : null,
    budget: hasBudget ? budget : null,
    handSize: HAND_SIZES.includes(data.handSize) ? data.handSize : 'average',
    counts: cleanCounts(data.counts),
    meals: cleanMeals(data.meals),
    goalMult: Number.isFinite(goalMult) && goalMult > 0 ? goalMult : 1.0,
    weight: Number.isFinite(weight) && weight > 0 ? weight : undefined,
    profile: {
      weight: '',
      height: '',
      age: '',
      bodyfat: '',
      activity: '1.55',
      ...(isObject(data.profile) ? data.profile : {})
    },
    dynamicRecalc: data.dynamicRecalc === true,
    targetHistory: cleanTargetHistory(data.targetHistory)
  };
}

function applyPersistentState(rawState) {
  const normalized = normalizeSavedState(rawState);
  if (!normalized) return false;

  state = {
    ...state,
    ...normalized,
    portions: state.portions,
    macroG: state.macroG
  };

  if (normalized.weight === undefined) delete state.weight;

  migrateTargetHistory();
  return true;
}

function loadState() {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) return;
    applyPersistentState(JSON.parse(rawState));
  } catch (error) {
    console.warn('Unable to load saved Handful state.', error);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistentState()));
  } catch (error) {
    console.warn('Unable to save Handful state.', error);
  }
}

function syncUIAfterStateChange() {
  document.querySelectorAll('.toggle-option[data-hand]').forEach(function(el) {
    el.classList.toggle('selected', el.dataset.hand === state.handSize);
  });
  document.querySelectorAll('.goal-option').forEach(function(el) {
    el.classList.toggle('selected', parseFloat(el.dataset.mult) === state.goalMult);
  });
  document.querySelectorAll('[data-dynamic-recalc]').forEach(function(el) {
    el.classList.toggle('selected', el.dataset.dynamicRecalc === String(state.dynamicRecalc));
  });

  restoreProfileUI();
  restoreCountUI();
  updateSetupUI();
  refreshDayViews();
  updateLogUI();
}

/* ══════════════════════════════════════════
   TABS
══════════════════════════════════════════ */
function switchTab(tab, options) {
  options = options || {};

  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('section-' + tab).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });

  if (tab !== 'setup') {
    disarmResetEverything();
    disarmImportBackup();
  }
  if (tab !== 'today') {
    disarmDeleteAllMeals();
    closeLogMealModal();
  }
  if (tab !== 'history') disarmDeleteHistoryDay();

  if (tab === 'today') {
    if (options.resetToToday) todayViewDate = getActualToday();
    disarmDeleteAllMeals();
    renderToday();
  }
  if (tab === 'history') renderHistory();
  if (tab === 'setup') updateSetupUI();
}

function isSectionActive(sectionId) {
  return document.getElementById(sectionId).classList.contains('active');
}

function refreshDayViews() {
  if (isSectionActive('section-today')) renderToday();
  if (isSectionActive('section-history')) renderHistory();
}

function handleAppClick(event) {
  disarmArmedConfirmsOnClickOutside(event);

  const tabButton = event.target.closest('[data-tab]');
  if (tabButton) {
    switchTab(tabButton.dataset.tab, { resetToToday: tabButton.dataset.tab === 'today' });
    return;
  }

  const setupPanelToggle = event.target.closest('[data-setup-panel]');
  if (setupPanelToggle) {
    toggleSetupPanel(setupPanelToggle.dataset.setupPanel);
    return;
  }

  const goalButton = event.target.closest('.goal-option');
  if (goalButton) {
    selectGoal(goalButton);
    return;
  }

  const dynamicRecalcButton = event.target.closest('[data-dynamic-recalc]');
  if (dynamicRecalcButton) {
    setDynamicRecalc(dynamicRecalcButton.dataset.dynamicRecalc === 'true');
    return;
  }

  const handButton = event.target.closest('.toggle-option[data-hand]');
  if (handButton) {
    selectHand(handButton);
    return;
  }

  const budgetButton = event.target.closest('[data-budget-type]');
  if (budgetButton) {
    changeBudget(budgetButton.dataset.budgetType, Number(budgetButton.dataset.budgetDelta));
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

  const deleteHistoryDayBtn = event.target.closest('[data-delete-history-day]');
  if (deleteHistoryDayBtn) {
    handleDeleteHistoryDay(deleteHistoryDayBtn.dataset.deleteHistoryDay);
    return;
  }

  const historyDayButton = event.target.closest('[data-history-day]');
  if (historyDayButton) {
    toggleHistoryDay(historyDayButton.dataset.historyDay);
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
    'open-setup-wizard': openSetupWizard,
    'close-setup-wizard': closeSetupWizard,
    'calculate-target': calculateTarget,
    'quick-add-processed': quickAddProcessed,
    'open-light-popup': openLightPopup,
    'open-heavy-popup': openHeavyPopup,
    'open-dairy-popup': openDairyPopup,
    'quick-add-soda': quickAddSoda,
    'open-log-meal': openLogMealModal,
    'close-log-meal': closeLogMealModal,
    'log-meal': logMeal,
    'reset-counts': resetCounts,
    'reset-day': handleResetDay,
    'today-prev-day': goToPreviousDay,
    'today-next-day': goToNextDay,
    'reset-everything': handleResetEverything,
    'export-backup': exportBackup,
    'import-backup': handleImportBackup,
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
  refreshDayViews();
}

function selectHand(el) {
  document.querySelectorAll('.toggle-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  state.handSize = el.dataset.hand;
  updatePortionKcals();
  updateMealTotal();
  updateSetupUI();
  recordTargetForToday();
  saveState();
  refreshDayViews();
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
  state.budget = calcGoalPortions(weight, state.goalMult, state.target, state.handSize);
  recordTargetForToday();
  saveState();
  setupWizardOpen = false;
  updateSetupUI();

  switchTab('today', { resetToToday: true });
  renderToday();
}

function ensureBudget() {
  if (!state.target) {
    state.budget = null;
    return;
  }
  if (state.budget && PORTION_TYPES.some((type) => state.budget[type] > 0)) return;

  state.budget = calcGoalPortions(
    state.weight || state.profile.weight || 70,
    state.goalMult,
    state.target,
    state.handSize
  );
  saveState();
}

function budgetTotalKcal() {
  const budget = state.budget || cleanCounts({});
  const p = state.portions[state.handSize];
  return PORTION_TYPES.reduce((total, type) => total + budget[type] * p[type], 0);
}

function getEffectiveTarget() {
  if (!state.target) return 0;
  ensureBudget();
  return budgetTotalKcal();
}

function calcEffectiveBudget(logged) {
  const base = state.budget || cleanCounts({});
  if (!state.dynamicRecalc) return base;

  const p = state.portions[state.handSize];
  const dailyTarget = getEffectiveTarget();
  const consumedKcal = PORTION_TYPES.reduce(
    (sum, type) => sum + (logged[type] || 0) * p[type],
    0
  );
  const remainingKcal = dailyTarget - consumedKcal;
  const effective = { ...base };

  if (remainingKcal <= 0) {
    DYNAMIC_CUT_ORDER.forEach((type) => {
      const loggedCount = logged[type] || 0;
      effective[type] = loggedCount >= base[type] ? base[type] : loggedCount;
    });
    return effective;
  }

  let deficitKcal = 0;
  PORTION_TYPES.forEach((type) => {
    const over = Math.max(0, (logged[type] || 0) - base[type]);
    deficitKcal += over * p[type];
  });

  if (deficitKcal <= 0) return base;

  let deficit = deficitKcal;
  DYNAMIC_CUT_ORDER.forEach((type) => {
    if (deficit <= 0) return;
    const minTarget = logged[type] || 0;
    const maxCut = Math.max(0, effective[type] - minTarget);
    const cutPortions = Math.min(maxCut, Math.floor(deficit / p[type]));
    if (cutPortions > 0) {
      effective[type] -= cutPortions;
      deficit -= cutPortions * p[type];
    }
  });

  return effective;
}

function setDynamicRecalc(enabled) {
  state.dynamicRecalc = enabled;
  saveState();
  updateSetupUI();
  refreshDayViews();
}

function setSetupPanelOpen(panelKey, open) {
  const panel = document.getElementById('setup-panel-' + panelKey);
  if (!panel || panel.hidden) return;

  panel.classList.toggle('open', open);
  const toggle = panel.querySelector('.setup-panel-toggle');
  if (toggle) toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (panelKey === 'backup' && !open) disarmImportBackup();
  if (panelKey === 'danger' && !open) disarmResetEverything();
}

function toggleSetupPanel(panelKey) {
  const panel = document.getElementById('setup-panel-' + panelKey);
  if (!panel || panel.hidden) return;
  setSetupPanelOpen(panelKey, !panel.classList.contains('open'));
}

function updateSetupBudgetUI() {
  const panel = document.getElementById('setup-panel-budget');
  const wrap = document.getElementById('setup-budget');
  if (!panel || !wrap) return;

  if (!state.target || !state.budget) {
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const p = state.portions[state.handSize];

  PORTION_TYPES.forEach((type) => {
    const count = state.budget[type] || 0;
    document.getElementById('budget-count-' + type).textContent = count;
    document.getElementById('budget-kcal-' + type).textContent = (count * p[type]) + ' kcal';
  });

  document.getElementById('budget-total').textContent = budgetTotalKcal() + ' kcal';
}

function updateSetupUI() {
  const hasTarget = !!state.target;
  const wizard = document.getElementById('setup-wizard');
  const recalcWrap = document.getElementById('setup-recalc-wrap');
  const cancelBtn = document.querySelector('[data-action="close-setup-wizard"]');

  if (!hasTarget) {
    setupWizardOpen = false;
    if (wizard) wizard.hidden = false;
    if (recalcWrap) recalcWrap.hidden = true;
    if (cancelBtn) cancelBtn.hidden = true;
  } else {
    if (wizard) wizard.hidden = !setupWizardOpen;
    if (recalcWrap) recalcWrap.hidden = setupWizardOpen;
    if (cancelBtn) cancelBtn.hidden = !setupWizardOpen;
  }

  if (!hasTarget || setupWizardOpen) {
    setSetupPanelOpen('calculator', true);
  }

  updateSetupBudgetUI();

  document.querySelectorAll('[data-dynamic-recalc]').forEach((el) => {
    el.classList.toggle('selected', el.dataset.dynamicRecalc === String(state.dynamicRecalc));
  });
}

function openSetupWizard() {
  setupWizardOpen = true;
  setSetupPanelOpen('calculator', true);
  updateSetupUI();
}

function closeSetupWizard() {
  setupWizardOpen = false;
  const errEl = document.getElementById('setup-error');
  if (errEl) errEl.style.display = 'none';
  updateSetupUI();
}

function changeBudget(type, delta) {
  if (!state.budget) return;

  state.budget[type] = Math.max(0, (state.budget[type] || 0) + delta);
  updateSetupUI();
  recordTargetForToday();
  saveState();
  refreshDayViews();
}

/* ══════════════════════════════════════════
   LOG MEAL
══════════════════════════════════════════ */
function formatLogMealDayLabel(day) {
  if (isSameDay(day, getActualToday())) return 'today';
  const yesterday = getActualToday();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(day, yesterday)) return 'yesterday';
  return MONTH_NAMES[day.getMonth()] + ' ' + day.getDate();
}

function updateLogMealButtonLabel() {
  const btn = document.getElementById('log-meal-btn');
  if (!btn) return;
  const day = logTargetDay || getActualToday();
  btn.textContent = 'Add to ' + formatLogMealDayLabel(day) + ' →';
}

function openLogMealModal() {
  logTargetDay = startOfDay(todayViewDate);
  updateLogUI();
  setPopupOpen('log-meal', true);
}

function closeLogMealModal() {
  closePopup('log-meal');
}

function updateLogUI() {
  const noTarget = document.getElementById('no-target-msg');
  const logContent = document.getElementById('log-content');
  const logFooter = document.getElementById('log-meal-footer');
  if (!state.target) {
    noTarget.style.display = 'block';
    logContent.style.display = 'none';
    if (logFooter) logFooter.style.display = 'none';
  } else {
    noTarget.style.display = 'none';
    logContent.style.display = 'block';
    if (logFooter) logFooter.style.display = 'flex';
    updateLogMealButtonLabel();
    updatePortionKcals();
    updateMealTotal();
  }
}

function updatePortionKcals() {
  const p = state.portions[state.handSize];
  const types = ['protein', 'veggie', 'carb', 'fat'];
  types.forEach(t => {
    const c = state.counts[t];
    const kcalEl = document.getElementById(t + '-kcal');
    kcalEl.textContent = (c * p[t]) + ' kcal';
    kcalEl.classList.toggle('is-zero', c === 0);
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

function getMealTimestampForLogDay() {
  const day = logTargetDay || getActualToday();
  const now = new Date();
  const target = new Date(day);
  target.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  return target.getTime();
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
    timestamp: getMealTimestampForLogDay(),
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
  todayViewDate = startOfDay(logTargetDay || getActualToday());
  closeLogMealModal();
  renderToday();
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
   TODAY & HISTORY
══════════════════════════════════════════ */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MEAL_ICONS = { protein: '🥩', veggie: '🥦', carb: '🌾', fat: '🥑' };
const PORTION_ROW_META = [
  { key: 'protein', icon: '🥩', label: 'Protein', sub: 'palms' },
  { key: 'veggie', icon: '🥦', label: 'Veggies', sub: 'fists' },
  { key: 'carb', icon: '🌾', label: 'Carbs', sub: 'handfuls' },
  { key: 'fat', icon: '🥑', label: 'Fats', sub: 'thumbs' }
];


function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getActualToday() {
  return startOfDay(new Date());
}

function isSameDay(a, b) {
  return startOfDay(a).toDateString() === startOfDay(b).toDateString();
}

function getTodayViewDayStr() {
  return todayViewDate.toDateString();
}

function goToPreviousDay() {
  disarmDeleteAllMeals();
  const next = new Date(todayViewDate);
  next.setDate(next.getDate() - 1);
  todayViewDate = startOfDay(next);
  renderToday();
}

function goToNextDay() {
  if (isSameDay(todayViewDate, getActualToday())) return;
  disarmDeleteAllMeals();
  const next = new Date(todayViewDate);
  next.setDate(next.getDate() + 1);
  todayViewDate = startOfDay(next);
  renderToday();
}

function formatShortDate(date) {
  return `${DAY_NAMES[date.getDay()].slice(0, 3)}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

function getMealsForDay(dayStr) {
  return state.meals.filter(m => new Date(m.timestamp).toDateString() === dayStr);
}

function sumMealTotals(meals) {
  const totals = { protein: 0, veggie: 0, carb: 0, fat: 0, kcal: 0 };
  meals.forEach(function(m) {
    totals.kcal += m.kcal;
    PORTION_TYPES.forEach(function(type) {
      totals[type] += m.portions[type];
    });
  });
  return totals;
}

function getRollingWeekDays() {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    days.push(date);
  }
  return days;
}

function getDayKcalByType(meals) {
  const p = state.portions[state.handSize];
  const kcalByType = { protein: 0, veggie: 0, carb: 0, fat: 0 };
  meals.forEach(function(meal) {
    PORTION_TYPES.forEach(function(type) {
      kcalByType[type] += meal.portions[type] * p[type];
    });
  });
  return kcalByType;
}

function getHistoryDayData(meals) {
  const kcalByType = getDayKcalByType(meals);
  const totalKcal = PORTION_TYPES.reduce(function(sum, type) {
    return sum + kcalByType[type];
  }, 0);

  return { kcalByType: kcalByType, totalKcal: totalKcal };
}

function getHistoryChartScaleMax(dayEntries) {
  let max = 0;
  dayEntries.forEach(function(entry) {
    if (entry.dayTarget > max) max = entry.dayTarget;
    if (entry.data.totalKcal > max) max = entry.data.totalKcal;
  });
  if (max <= 0) return 1;
  return Math.ceil(max * 1.12);
}

function kcalToBarPct(kcal, scaleMax) {
  if (scaleMax <= 0 || kcal <= 0) return 0;
  return (kcal / scaleMax) * 100;
}

function getRollingWeekDayEntries() {
  return getRollingWeekDays().map(function(date) {
    const dayStr = date.toDateString();
    const meals = getMealsForDay(dayStr);
    return {
      date: date,
      dayStr: dayStr,
      dayTarget: getTargetForDay(dayStr),
      data: getHistoryDayData(meals)
    };
  });
}

function getRollingWeekAverageKcal(dayEntries) {
  const todayStr = new Date().toDateString();
  const loggedDays = dayEntries.filter(function(entry) {
    return entry.dayStr !== todayStr && entry.data.totalKcal > 0;
  });
  if (loggedDays.length === 0) return null;

  const totalKcal = loggedDays.reduce(function(sum, entry) {
    return sum + entry.data.totalKcal;
  }, 0);
  return Math.round(totalKcal / loggedDays.length);
}

function updateHistoryWeekAverage(dayEntries) {
  const wrap = document.getElementById('history-week-avg');
  const valueEl = document.getElementById('history-week-avg-value');
  if (!wrap || !valueEl) return;

  const avg = getRollingWeekAverageKcal(dayEntries);
  if (avg === null) {
    wrap.hidden = true;
    return;
  }

  wrap.hidden = false;
  valueEl.textContent = avg + ' kcal/day';
}

function renderHistoryChart() {
  const chart = document.getElementById('history-chart');
  if (!chart) return;

  const todayStr = new Date().toDateString();
  const dayEntries = getRollingWeekDayEntries();
  const labels = [];

  updateHistoryWeekAverage(dayEntries);

  const scaleMax = getHistoryChartScaleMax(dayEntries);

  chart.innerHTML = '';
  chart.removeAttribute('aria-hidden');
  chart.setAttribute('role', 'img');

  const row = document.createElement('div');
  row.className = 'history-chart-days';

  dayEntries.forEach(function(entry) {
    const consumed = entry.data.totalKcal;
    const isToday = entry.dayStr === todayStr;
    const dayTarget = entry.dayTarget;

    labels.push(
      DAY_ABBR[entry.date.getDay()] + ': ' +
      (consumed > 0
        ? Math.round(consumed) + (dayTarget ? ' of ' + dayTarget + ' kcal' : ' kcal')
        : (dayTarget ? 'no meals, target ' + dayTarget + ' kcal' : 'no meals'))
    );

    const dayEl = document.createElement('div');
    dayEl.className = 'history-chart-day' + (isToday ? ' today' : '');

    const kcalEl = document.createElement('span');
    kcalEl.className = 'history-chart-kcal' + (consumed <= 0 ? ' is-zero' : '');
    kcalEl.textContent = consumed > 0 ? String(Math.round(consumed)) : '—';
    kcalEl.setAttribute('aria-hidden', 'true');

    const barWrap = document.createElement('div');
    barWrap.className = 'history-chart-bar-wrap';

    const bar = document.createElement('div');
    bar.className = 'history-chart-bar';
    bar.setAttribute('aria-hidden', 'true');

    const fill = document.createElement('div');
    fill.className = 'history-chart-fill';
    fill.style.height = kcalToBarPct(consumed, scaleMax) + '%';

    PORTION_TYPES.forEach(function(type) {
      const kcal = entry.data.kcalByType[type];
      if (kcal <= 0) return;
      const seg = document.createElement('div');
      seg.className = 'history-chart-seg progress-seg ' + type;
      seg.style.flex = kcal + ' 1 0';
      fill.appendChild(seg);
    });

    bar.appendChild(fill);
    barWrap.appendChild(bar);

    if (dayTarget) {
      const targetLine = document.createElement('div');
      targetLine.className = 'history-chart-target-line';
      targetLine.style.bottom = kcalToBarPct(dayTarget, scaleMax) + '%';
      targetLine.setAttribute('aria-hidden', 'true');
      barWrap.appendChild(targetLine);
    }

    const label = document.createElement('span');
    label.className = 'history-chart-label';
    label.textContent = DAY_ABBR[entry.date.getDay()];

    dayEl.appendChild(label);
    dayEl.appendChild(barWrap);
    dayEl.appendChild(kcalEl);
    row.appendChild(dayEl);
  });

  chart.appendChild(row);
  chart.setAttribute('aria-label', 'Last 7 days calorie intake. ' + labels.join('. '));
}

function groupMealsByDay() {
  const groups = new Map();
  state.meals.forEach(function(meal) {
    const dayStr = new Date(meal.timestamp).toDateString();
    if (!groups.has(dayStr)) groups.set(dayStr, []);
    groups.get(dayStr).push(meal);
  });

  return Array.from(groups.entries())
    .sort(function(a, b) { return new Date(b[0]) - new Date(a[0]); })
    .map(function(entry) {
      return {
        dayStr: entry[0],
        date: new Date(entry[0]),
        meals: entry[1].sort(function(a, b) { return a.timestamp - b.timestamp; })
      };
    });
}

function renderPortionCards(container, logged, targets) {
  container.innerHTML = '';
  PORTION_ROW_META.forEach(function(row) {
    const count = logged[row.key] || 0;
    let dotsHtml = '<div class="pt-dots" aria-hidden="true">';
    let fracHtml;
    let ariaLabel;
    let cardClass = 'pt-card ' + row.key;

    if (targets) {
      const target = targets[row.key] || 0;
      const eaten = Math.min(count, target);
      const remaining = Math.max(0, target - count);
      const extra = Math.max(0, count - target);
      for (let i = 0; i < eaten; i++) dotsHtml += '<span class="pt-dot eaten"></span>';
      for (let i = 0; i < remaining; i++) dotsHtml += '<span class="pt-dot left"></span>';
      for (let i = 0; i < extra; i++) dotsHtml += '<span class="pt-dot eaten"></span>';
      fracHtml =
        '<div class="pt-frac">' +
          '<span class="pt-frac-eaten ' + row.key + '">' + count + '</span>' +
          '<span class="pt-frac-slash ' + row.key + '">/</span>' +
          '<span class="pt-frac-target ' + row.key + '">' + target + '</span>' +
        '</div>';
      ariaLabel = row.label + ': ' + count + ' of ' + target + ' ' + row.sub;
      if (count >= target && target > 0) cardClass += ' complete';
    } else {
      for (let i = 0; i < count; i++) dotsHtml += '<span class="pt-dot eaten"></span>';
      fracHtml = '<div class="pt-frac"><span class="pt-frac-eaten ' + row.key + '">' + count + '</span></div>';
      ariaLabel = row.label + ': ' + count + ' ' + row.sub;
    }
    dotsHtml += '</div>';

    const card = document.createElement('div');
    card.className = cardClass;
    card.setAttribute('aria-label', ariaLabel);
    card.innerHTML =
      '<div class="pt-head">' +
        '<div class="pt-icon">' + row.icon + '</div>' +
        '<div class="pt-label ' + row.key + '">' + row.label + '</div>' +
        fracHtml +
      '</div>' +
      dotsHtml;
    container.appendChild(card);
  });
}

function renderPortionRow(container, logged, targets, kcal) {
  container.innerHTML = '';
  const labels = [];

  PORTION_ROW_META.forEach(function(row) {
    const count = logged[row.key] || 0;
    const target = targets[row.key] || 0;
    const complete = count >= target && target > 0;

    const item = document.createElement('span');
    item.className = 'history-pt ' + row.key + (complete ? ' complete' : '');
    item.innerHTML =
      '<span class="history-pt-icon" aria-hidden="true">' + row.icon + '</span>' +
      '<span class="history-pt-frac">' +
        '<span class="history-pt-eaten">' + count + '</span>' +
        '<span class="history-pt-slash">/</span>' +
        '<span class="history-pt-target">' + target + '</span>' +
      '</span>';
    labels.push(row.label + ': ' + count + ' of ' + target);
    container.appendChild(item);
  });

  if (kcal) {
    const consumed = Math.round(kcal.consumed);
    const goal = kcal.goal;
    const kcalItem = document.createElement('span');
    kcalItem.className = 'history-kcal';
    kcalItem.innerHTML = '<span class="history-kcal-frac">' + consumed + '/' + goal + '</span>';
    labels.push('Calories: ' + consumed + ' of ' + goal);
    container.appendChild(kcalItem);
  }

  container.setAttribute('aria-label', labels.join(', '));
}

function renderMealList(container, meals, options) {
  const deletable = options && options.deletable;
  const emptyMessage = (options && options.emptyMessage) || 'No meals logged.';
  container.innerHTML = '';

  if (meals.length === 0) {
    container.innerHTML =
      '<div class="empty-state"><div class="icon">🍽</div><div>' + emptyMessage + '</div></div>';
    return;
  }

  meals.forEach(function(meal, index) {
    const time = new Date(meal.timestamp);
    const hh = String(time.getHours()).padStart(2, '0');
    const mm = String(time.getMinutes()).padStart(2, '0');
    let emojiStr = '';
    PORTION_TYPES.forEach(function(type) {
      const n = meal.portions[type];
      if (n > 0) emojiStr += (emojiStr ? ' ' : '') + MEAL_ICONS[type].repeat(n);
    });

    const entry = document.createElement('div');
    entry.className = 'meal-entry';

    const left = document.createElement('div');
    const timeEl = document.createElement('div');
    timeEl.className = 'meal-entry-time';
    timeEl.textContent = hh + ':' + mm;
    const portionsEl = document.createElement('div');
    portionsEl.className = 'meal-entry-portions';
    portionsEl.textContent = emojiStr;
    left.appendChild(timeEl);
    left.appendChild(portionsEl);

    const kcalEl = document.createElement('div');
    kcalEl.className = 'meal-entry-kcal';
    kcalEl.textContent = meal.kcal + ' kcal';

    entry.appendChild(left);
    entry.appendChild(kcalEl);

    if (deletable) {
      const delBtn = document.createElement('button');
      delBtn.className = 'meal-delete';
      delBtn.title = 'Delete';
      delBtn.textContent = '✕';
      delBtn.dataset.deleteMealIndex = index;
      entry.appendChild(delBtn);
    }

    container.appendChild(entry);
  });
}

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

  const actualToday = getActualToday();
  const isViewingToday = isSameDay(todayViewDate, actualToday);
  const dayStr = getTodayViewDayStr();
  const dateStrEl = document.getElementById('today-date-str');
  const dayName = DAY_NAMES[todayViewDate.getDay()];
  const dateRest = todayViewDate.getDate() + ' ' + MONTH_NAMES[todayViewDate.getMonth()] + ' ' + todayViewDate.getFullYear();
  dateStrEl.innerHTML = '<span class="today-day-name' + (isViewingToday ? ' is-today' : '') + '">' + dayName + '</span>, ' + dateRest;

  const nextDayBtn = document.getElementById('today-next-day');
  if (nextDayBtn) nextDayBtn.disabled = isViewingToday;

  const dayMeals = getMealsForDay(dayStr);
  const totals = sumMealTotals(dayMeals);
  const totalKcal = totals.kcal;
  const p = state.portions[state.handSize];
  const kcalByType = { protein: 0, veggie: 0, carb: 0, fat: 0 };

  dayMeals.forEach(function(m) {
    PORTION_TYPES.forEach(function(k) {
      kcalByType[k] += m.portions[k] * p[k];
    });
  });

  // Progress — goal kcal follows the current portion budget total
  const goalKcal = getEffectiveTarget();
  const consumedLo = Math.round(totalKcal * 0.95);
  const consumedHi = Math.round(totalKcal * 1.05);
  const isOverTarget = goalKcal > 0 && consumedLo > goalKcal;
  const rawPct = goalKcal > 0 ? Math.round((totalKcal / goalKcal) * 100) : 0;
  const pct = isOverTarget || rawPct >= 100 ? 100 : Math.min(100, rawPct);
  const fill = document.getElementById('prog-fill');

  document.getElementById('prog-consumed').textContent =
    totalKcal === 0 ? '0' : consumedLo + '–' + consumedHi;
  document.getElementById('prog-total').textContent = goalKcal;
  fill.style.width = pct + '%';

  ['protein', 'veggie', 'carb', 'fat'].forEach(function(k) {
    const seg = document.getElementById('prog-seg-' + k);
    seg.style.flex = totalKcal > 0 ? (kcalByType[k] + ' 1 0') : '0 0 0';
    seg.style.width = '';
  });

  const leftEl = document.getElementById('prog-left');
  if (consumedHi < goalKcal) {
    const rem = goalKcal - consumedHi;
    leftEl.textContent = rem + ' left';
    fill.classList.remove('full');
  } else if (consumedLo <= goalKcal) {
    leftEl.textContent = 'on target';
    fill.classList.toggle('full', rawPct >= 100);
  } else {
    leftEl.textContent = '—';
    fill.classList.add('full');
  }

  // Portion targets — shrink when dynamic recalc is on and another type overshot
  const goals = calcEffectiveBudget({
    protein: totals.protein,
    veggie: totals.veggie,
    carb: totals.carb,
    fat: totals.fat
  });
  renderPortionCards(document.getElementById('portion-targets'), totals, goals);
  renderMealList(document.getElementById('meal-list'), dayMeals, {
    deletable: true,
    emptyMessage: isViewingToday ? 'No meals logged yet today.' : 'No meals logged on this day.'
  });

  const resetWrap = document.getElementById('today-reset-wrap');
  if (resetWrap) {
    if (dayMeals.length === 0) {
      disarmDeleteAllMeals();
      resetWrap.hidden = true;
    } else {
      resetWrap.hidden = false;
    }
  }
}

function toggleHistoryDay(dayStr) {
  if (historyExpandedDays.has(dayStr)) {
    historyExpandedDays.delete(dayStr);
    if (deleteHistoryDayArmed === dayStr) disarmDeleteHistoryDay();
  } else {
    historyExpandedDays.add(dayStr);
  }
  renderHistory();
}

function renderHistory() {
  const noTarget = document.getElementById('history-no-target');
  const content = document.getElementById('history-content');
  const list = document.getElementById('history-list');

  if (!state.target) {
    noTarget.style.display = 'block';
    content.style.display = 'none';
    const chart = document.getElementById('history-chart');
    if (chart) {
      chart.innerHTML = '';
      chart.setAttribute('aria-hidden', 'true');
    }
    const weekAvg = document.getElementById('history-week-avg');
    if (weekAvg) weekAvg.hidden = true;
    return;
  }

  noTarget.style.display = 'none';
  content.style.display = 'block';

  renderHistoryChart();

  const dayGroups = groupMealsByDay();

  list.innerHTML = '';
  if (dayGroups.length === 0) {
    list.innerHTML =
      '<div class="empty-state"><div class="icon">📅</div><div>No meals logged yet.</div></div>';
    return;
  }

  dayGroups.forEach(function(group) {
    const totals = sumMealTotals(group.meals);
    const isExpanded = historyExpandedDays.has(group.dayStr);
    const dayBlock = document.createElement('div');
    dayBlock.className = 'history-day' + (isExpanded ? ' expanded' : '');

    const expandBtn = document.createElement('button');
    expandBtn.type = 'button';
    expandBtn.className = 'history-day-toggle';
    expandBtn.dataset.historyDay = group.dayStr;
    expandBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    expandBtn.setAttribute('aria-label', (isExpanded ? 'Hide' : 'Show') + ' meals for ' + formatShortDate(group.date));

    const headerRow = document.createElement('div');
    headerRow.className = 'history-day-header';
    headerRow.innerHTML =
      '<span class="date-today">' + formatShortDate(group.date) + '</span>' +
      '<span class="history-day-chevron" aria-hidden="true"></span>';
    expandBtn.appendChild(headerRow);

    const portionsRow = document.createElement('div');
    portionsRow.className = 'history-portions';
    const goals = calcEffectiveBudget({
      protein: totals.protein,
      veggie: totals.veggie,
      carb: totals.carb,
      fat: totals.fat
    });
    const dayTarget = getTargetForDay(group.dayStr);
    renderPortionRow(portionsRow, totals, goals, dayTarget ? {
      consumed: totals.kcal,
      goal: dayTarget
    } : null);
    expandBtn.appendChild(portionsRow);
    dayBlock.appendChild(expandBtn);

    const mealList = document.createElement('div');
    mealList.className = 'meal-list history-day-meals';
    mealList.hidden = !isExpanded;
    renderMealList(mealList, group.meals);
    dayBlock.appendChild(mealList);

    const deleteWrap = document.createElement('div');
    deleteWrap.className = 'history-delete-day-wrap';
    deleteWrap.hidden = !isExpanded;
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-link history-delete-day-btn';
    deleteBtn.dataset.deleteHistoryDay = group.dayStr;
    deleteBtn.textContent = deleteHistoryDayArmed === group.dayStr
      ? DELETE_HISTORY_DAY_CONFIRM_LABEL
      : DELETE_HISTORY_DAY_LABEL;
    if (deleteHistoryDayArmed === group.dayStr) {
      deleteBtn.classList.add('btn-link-armed');
    }
    deleteWrap.appendChild(deleteBtn);
    dayBlock.appendChild(deleteWrap);

    list.appendChild(dayBlock);
  });
}

function deleteMeal(index) {
  const dayStr = getTodayViewDayStr();
  const dayMeals = getMealsForDay(dayStr);
  const toDelete = dayMeals[index];
  state.meals = state.meals.filter(m => m !== toDelete);
  saveState();
  refreshDayViews();
}

const DELETE_ALL_MEALS_LABEL = 'Clear all';
const DELETE_ALL_MEALS_CONFIRM_LABEL = 'Are you sure?';
let deleteAllMealsArmed = false;

function disarmDeleteAllMeals() {
  deleteAllMealsArmed = false;
  const btn = document.getElementById('delete-all-meals-btn');
  if (!btn) return;
  btn.textContent = DELETE_ALL_MEALS_LABEL;
  btn.classList.remove('btn-link-armed');
}

function handleResetDay() {
  if (!deleteAllMealsArmed) {
    deleteAllMealsArmed = true;
    const btn = document.getElementById('delete-all-meals-btn');
    if (btn) {
      btn.textContent = DELETE_ALL_MEALS_CONFIRM_LABEL;
      btn.classList.add('btn-link-armed');
    }
    return;
  }
  performResetDay();
}

function performResetDay() {
  disarmDeleteAllMeals();
  deleteMealsForDay(getTodayViewDayStr());
}

const DELETE_HISTORY_DAY_LABEL = 'Delete day';
const DELETE_HISTORY_DAY_CONFIRM_LABEL = 'Are you sure?';
let deleteHistoryDayArmed = null;

function disarmDeleteHistoryDay() {
  deleteHistoryDayArmed = null;
  document.querySelectorAll('.history-delete-day-btn').forEach(function(btn) {
    btn.textContent = DELETE_HISTORY_DAY_LABEL;
    btn.classList.remove('btn-link-armed');
  });
}

function handleDeleteHistoryDay(dayStr) {
  if (deleteHistoryDayArmed !== dayStr) {
    disarmDeleteHistoryDay();
    deleteHistoryDayArmed = dayStr;
    document.querySelectorAll('.history-delete-day-btn').forEach(function(btn) {
      if (btn.dataset.deleteHistoryDay === dayStr) {
        btn.textContent = DELETE_HISTORY_DAY_CONFIRM_LABEL;
        btn.classList.add('btn-link-armed');
      }
    });
    return;
  }
  performDeleteHistoryDay(dayStr);
}

function deleteMealsForDay(dayStr) {
  state.meals = state.meals.filter(m => new Date(m.timestamp).toDateString() !== dayStr);
  saveState();
  refreshDayViews();
}

function performDeleteHistoryDay(dayStr) {
  disarmDeleteHistoryDay();
  historyExpandedDays.delete(dayStr);
  deleteMealsForDay(dayStr);
}

const RESET_BTN_LABEL = 'Reset everything';
const RESET_BTN_CONFIRM_LABEL = 'Are you sure?';
let resetEverythingArmed = false;

function disarmResetEverything() {
  resetEverythingArmed = false;
  const btn = document.getElementById('reset-everything-btn');
  if (!btn) return;
  btn.textContent = RESET_BTN_LABEL;
  btn.classList.remove('setup-reset-btn-armed');
}

function handleResetEverything() {
  if (!resetEverythingArmed) {
    resetEverythingArmed = true;
    const btn = document.getElementById('reset-everything-btn');
    if (btn) {
      btn.textContent = RESET_BTN_CONFIRM_LABEL;
      btn.classList.add('setup-reset-btn-armed');
    }
    return;
  }
  performResetEverything();
}

function performResetEverything() {
  disarmResetEverything();
  disarmImportBackup();

  state.target = null;
  state.budget = null;
  state.handSize = 'average';
  state.counts = { protein: 0, veggie: 0, carb: 0, fat: 0 };
  state.meals = [];
  state.goalMult = 1.0;
  state.profile = {
    weight: '',
    height: '',
    age: '',
    bodyfat: '',
    activity: '1.55'
  };
  state.dynamicRecalc = false;
  state.targetHistory = [];
  delete state.weight;

  historyExpandedDays.clear();
  setupWizardOpen = false;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to clear saved Handful state.', error);
  }

  document.querySelectorAll('.toggle-option[data-hand]').forEach(function(el) {
    el.classList.toggle('selected', el.dataset.hand === 'average');
  });
  document.querySelectorAll('.goal-option').forEach(function(el) {
    el.classList.toggle('selected', parseFloat(el.dataset.mult) === 1.0);
  });

  ['heavy', 'light', 'dairy'].forEach(closePopup);
  closeLogMealModal();

  restoreProfileUI();
  restoreCountUI();
  updateSetupUI();
  switchTab('setup');
}

/* ══════════════════════════════════════════
   BACKUP
══════════════════════════════════════════ */
const IMPORT_BTN_LABEL = 'Import backup';
const IMPORT_BTN_CONFIRM_LABEL = 'Confirm import?';
let pendingImportPayload = null;
let importBackupArmed = false;

function describeBackupSummary(normalized) {
  const mealCount = normalized.meals.length;
  const mealLabel = mealCount + ' meal' + (mealCount === 1 ? '' : 's');
  return normalized.budget ? mealLabel + ', budget configured' : mealLabel + ', no budget';
}

function setImportBackupStatus(message, isError) {
  const status = document.getElementById('import-backup-status');
  if (!status) return;
  status.hidden = !message;
  status.textContent = message || '';
  status.classList.toggle('error-msg', !!isError);
  status.classList.toggle('setup-import-status', !isError);
}

function disarmImportBackup() {
  pendingImportPayload = null;
  importBackupArmed = false;
  const btn = document.getElementById('import-backup-btn');
  if (btn) {
    btn.textContent = IMPORT_BTN_LABEL;
    btn.classList.remove('setup-reset-btn-armed');
  }
  setImportBackupStatus('');
}

const ARMED_CONFIRM_CONTROLS = [
  {
    isArmed: function() { return deleteAllMealsArmed; },
    disarm: disarmDeleteAllMeals,
    buttonId: 'delete-all-meals-btn'
  },
  {
    isArmed: function() { return resetEverythingArmed; },
    disarm: disarmResetEverything,
    buttonId: 'reset-everything-btn'
  },
  {
    isArmed: function() { return importBackupArmed; },
    disarm: disarmImportBackup,
    buttonId: 'import-backup-btn',
    insideSelectors: ['#import-backup-status']
  },
  {
    isArmed: function() { return deleteHistoryDayArmed !== null; },
    disarm: disarmDeleteHistoryDay,
    isInside: function(event) {
      if (!deleteHistoryDayArmed) return false;
      const btn = event.target.closest('[data-delete-history-day]');
      return btn && btn.dataset.deleteHistoryDay === deleteHistoryDayArmed;
    }
  }
];

function isClickInsideArmedConfirm(event, control) {
  if (control.isInside && control.isInside(event)) return true;
  if (control.buttonId && event.target.closest('#' + control.buttonId)) return true;
  if (!control.insideSelectors) return false;
  return control.insideSelectors.some(function(selector) {
    return event.target.closest(selector);
  });
}

function disarmArmedConfirmsOnClickOutside(event) {
  ARMED_CONFIRM_CONTROLS.forEach(function(control) {
    if (control.isArmed() && !isClickInsideArmedConfirm(event, control)) {
      control.disarm();
    }
  });
}

function exportBackup() {
  const payload = {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: getPersistentState()
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'handful-backup-' + date + '.json';
  link.click();
  URL.revokeObjectURL(url);
}

function triggerImportBackupPicker() {
  const input = document.getElementById('import-backup-input');
  if (input) input.click();
}

function handleImportBackup() {
  if (importBackupArmed) {
    performImportBackup();
    return;
  }
  triggerImportBackupPicker();
}

function handleImportBackupFile(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function() {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (error) {
      disarmImportBackup();
      setImportBackupStatus('Invalid JSON file.', true);
      return;
    }

    const normalized = normalizeSavedState(parsed);
    if (!normalized) {
      disarmImportBackup();
      setImportBackupStatus('Unrecognized backup file.', true);
      return;
    }

    pendingImportPayload = normalized;
    importBackupArmed = true;
    const btn = document.getElementById('import-backup-btn');
    if (btn) {
      btn.textContent = IMPORT_BTN_CONFIRM_LABEL;
      btn.classList.add('setup-reset-btn-armed');
    }
    setImportBackupStatus('Ready to import: ' + describeBackupSummary(normalized) + '. This replaces all current data.');
  };
  reader.onerror = function() {
    disarmImportBackup();
    setImportBackupStatus('Could not read the selected file.', true);
  };
  reader.readAsText(file);
}

function performImportBackup() {
  if (!pendingImportPayload) {
    disarmImportBackup();
    return;
  }

  state = {
    ...state,
    ...pendingImportPayload,
    portions: state.portions,
    macroG: state.macroG
  };

  if (pendingImportPayload.weight === undefined) delete state.weight;

  migrateTargetHistory();
  historyExpandedDays.clear();
  setupWizardOpen = false;

  disarmImportBackup();
  saveState();
  syncUIAfterStateChange();
  switchTab('today', { resetToToday: true });
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

  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  function watchForUpdates(registration) {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }

  function checkForUpdates(registration) {
    registration.update().catch((error) => {
      console.warn('Service worker update check failed.', error);
    });
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`./service-worker.js?v=${APP_VERSION}`, { updateViaCache: 'none' })
      .then((registration) => {
        watchForUpdates(registration);
        checkForUpdates(registration);

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkForUpdates(registration);
          }
        });

        window.setInterval(() => checkForUpdates(registration), 60 * 60 * 1000);
      })
      .catch((error) => console.warn('Service worker registration failed.', error));
  });
}

const versionEl = document.getElementById('app-version');
if (versionEl) versionEl.textContent = `v${APP_VERSION}`;

document.addEventListener('click', handleAppClick);

const importBackupInput = document.getElementById('import-backup-input');
if (importBackupInput) {
  importBackupInput.addEventListener('change', handleImportBackupFile);
}

loadState();
ensureBudget();
restoreProfileUI();
restoreCountUI();
updateSetupUI();

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
  switchTab('today', { resetToToday: true });
} else {
  switchTab('setup');
}

registerServiceWorker();
