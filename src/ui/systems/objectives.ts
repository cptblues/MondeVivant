import { element, type UIContext } from '../uiContext';

export function updateObjectives(this: UIContext): void {
  element<HTMLElement>('#objectiveList').innerHTML = this.simulation.getMissionGoals().map((goal) => `<div class="objective-row ${goal.done ? 'is-done' : ''}"><span>${goal.done ? '✓' : ''}</span><p>${goal.label}</p></div>`).join('');
  const unlockGoals = this.simulation.getUnlockObjectives();
  const unlockList = element<HTMLElement>('#unlockList');
  const unlockTitle = element<HTMLElement>('#unlockTitle');
  unlockList.hidden = unlockGoals.length === 0;
  unlockTitle.hidden = unlockGoals.length === 0;
  unlockList.innerHTML = unlockGoals.map((goal) => `<div class="unlock-row ${goal.done ? 'is-done' : ''}"><span>${goal.done ? '✓' : '·'}</span><p><strong>${goal.label}</strong><small>${goal.reward}</small></p></div>`).join('');
  element<HTMLElement>('#journalList').innerHTML = this.simulation.logs.slice(0, 8).map((entry) => `<div class="journal-row">${entry}</div>`).join('');
}

export function updateTutorialHint(this: UIContext): void {
  const hint = this.simulation.getNextHint();
  this.tutorialCard.hidden = !hint;
  if (!hint) return;
  element<HTMLElement>('#tutorialTitle').textContent = hint.title;
  element<HTMLElement>('#tutorialBody').textContent = hint.body;
}

export const objectivesUiMethods = {
  updateObjectives,
  updateTutorialHint,
};
