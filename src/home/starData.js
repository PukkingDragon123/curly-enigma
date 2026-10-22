// Old Star's corner of the save: state.data.oldstar = { lesson, skipped, talkI, chestFirst,
// chestDay, wake, wakeDay, cartDay, poolDay, glints, woke }. Filled in on first use (older saves:
// carried over from the tavern's state.data.tavern; a game already well under way has had its
// lessons). lesson: 'wake' → 'mine' → 'forge' → 'cook' → 'done'.
export const LESSONS = ['wake', 'mine', 'forge', 'cook', 'done'];

export function starData(st) {
  const d = st.data;
  if (!d.oldstar || typeof d.oldstar !== 'object') d.oldstar = { ...(d.tavern || {}) };
  const o = d.oldstar;
  if (!LESSONS.includes(o.lesson)) {
    const s = d.stats || {};
    const begun = d.flags?.escaped || (s.weapons || 0) > 0 || (s.dishes || 0) > 0 || (s.trips || 0) > 1 || (d.day || 1) > 2 || d.quests?.done?.lessons;
    o.lesson = begun ? 'done' : d.flags?.fallen ? 'mine' : 'wake';
  }
  return o;
}
