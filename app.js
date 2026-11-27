import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

// Editable wording for the removal exam rules.
const REMOVAL_RULES = [
  'Two of these four problems will be given at random: one midterm topic and one finals topic.',
  'You implement each data structure from scratch in C++. The main.cpp file is provided; you write everything else.',
  'The removal exam is pass or fail. If you pass, your final grade becomes 3.0. If you fail, your current grade stands.',
];
const PASS_LINE = '58.5% (grade 3.0)';
const REMOVAL_LINE = '43.5% (grade 2.5)';
const HIGH_REMOVAL = 70;

const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const $ = (id) => document.getElementById(id);
const form = $('lookup'), msg = $('msg'), out = $('result'), btn = $('go');

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined && text !== null) n.textContent = text;
  return n;
}
const pct = (v) => `${Number(v).toFixed(1)}%`;

function showMsg(text) {
  msg.textContent = text;
  msg.hidden = !text;
}

function stat(label, value, note) {
  const box = el('div', 'stat');
  box.append(el('span', 'stat-label', label), el('span', 'stat-value', value));
  if (note) box.append(el('span', 'stat-note', note));
  return box;
}

function needRow(label, line, need, maxPct, showDetail = true) {
  const row = el('div', 'need');
  const left = el('div');
  left.append(el('span', 'need-label', label), el('span', 'need-line', `Final grade of ${line}`));
  const n = Number(need);
  let val, cls;
  if (n <= 0) { val = 'Already secured'; cls = 'ok'; }
  else if (n <= 100) { val = pct(n); cls = n <= HIGH_REMOVAL ? 'mid' : 'hard'; }
  else { val = 'Not reachable'; cls = 'no'; }
  const right = el('span', `need-value ${cls}`, val);
  row.append(left, right);
  if (n > 100 && showDetail) {
    row.append(el('p', 'need-detail',
      `Even 100% on the remaining work brings your final to ${pct(maxPct)}.`));
  }
  return row;
}

function render(d) {
  out.replaceChildren();
  const card = el('div', 'card');

  const head = el('div', 'res-head');
  head.append(el('h2', null, d.name), el('p', 'sub', `Section ${d.section} · records as of ${d.updated_at}`));
  card.append(head);

  const grid = el('div', 'stats');
  grid.append(
    stat('Midterm', pct(d.midterm_pct), `Grade ${Number(d.midterm_grade).toFixed(1)}`),
    stat('Class standing (finals)', pct(d.class_standing_pct), 'Seatwork, quizzes, library work, attendance'),
    stat('Prefinal exam', pct(d.prefinal_pct), null),
  );
  card.append(grid);

  const need = el('div', 'needs');
  need.append(el('h3', null, 'What you need on the final exam'));
  const bothOut = Number(d.need_pass_pct) > 100 && Number(d.need_removal_pct) > 100;
  need.append(needRow('To pass the course', PASS_LINE, d.need_pass_pct, d.max_final_pct, !bothOut));
  if (Number(d.need_pass_pct) > 0) {
    need.append(needRow('To qualify for the removal exam', REMOVAL_LINE, d.need_removal_pct, d.max_final_pct));
  }
  need.append(el('p', 'fine',
    'This is the average score you need across the final lecture exam, the final lab exam, and the remaining ' +
    'CodeChum lab. Finals seatwork and attendance are counted at your midterm level until they are recorded.'));
  card.append(need);

  const topics = d.removal_topics;
  if (Array.isArray(topics) && topics.length && Number(d.need_removal_pct) <= HIGH_REMOVAL && Number(d.need_pass_pct) > 0) {
    const rem = el('div', 'removal');
    rem.append(el('h3', null, 'If you end up in the removal exam'));
    rem.append(el('p', null, 'Study these four problems. They were picked from the activities you did best in.'));
    for (const group of ['Midterm', 'Finals']) {
      const items = topics.filter((t) => t.group === group);
      if (!items.length) continue;
      rem.append(el('p', 'group', `${group} topics`));
      const ul = el('ul', 'topics');
      for (const t of items) ul.append(el('li', null, t.topic));
      rem.append(ul);
    }
    rem.append(el('p', 'group', 'How it works'));
    const rules = el('ul', 'rules');
    for (const r of REMOVAL_RULES) rules.append(el('li', null, r));
    rem.append(rules);
    card.append(rem);
  }

  const again = el('button', 'ghost', 'Look up another record');
  again.type = 'button';
  again.addEventListener('click', () => {
    out.hidden = true; out.replaceChildren(); form.hidden = false; form.reset(); showMsg('');
    window.scrollTo({ top: 0 });
  });
  card.append(again);

  out.append(card);
  out.hidden = false;
  form.hidden = true;
  window.scrollTo({ top: 0 });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showMsg('');
  const section = $('section').value;
  const sid = $('sid').value.trim();
  const last = $('last').value.trim();
  const first = $('first').value.trim();
  if (!section || !sid || !last || !first) {
    showMsg('Fill in all four fields.');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const { data, error } = await db.rpc('lookup_grade', {
      p_section: section, p_student_id: sid, p_last_name: last, p_first_name: first,
    });
    if (error) throw error;
    if (data && data.ok) {
      render(data);
    } else if (data && data.error === 'locked') {
      showMsg('Too many attempts for this student ID. Wait 15 minutes, then try again.');
    } else {
      showMsg('No matching record. Check your section, student ID, and names against the class record. ' +
              'If it still fails, message your instructor.');
    }
  } catch (err) {
    console.error(err);
    showMsg('The lookup service is not reachable right now. Try again in a few minutes.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'View my grades';
  }
});
