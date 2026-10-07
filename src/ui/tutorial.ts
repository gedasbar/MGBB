export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  targetElementId?: string;
  requiredAction?: 'place_splitter' | 'order_check' | 'crossover' | 'start_run';
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 'intro', title: 'Welcome Commander', text: 'Welcome to Mitosis Gun Builder! Let us start by building your circuit.' },
  { id: 'splitter', title: 'The Power of Many', text: 'Place a Splitter block to divide your generator\'s output into two lanes.', requiredAction: 'place_splitter' },
  { id: 'order', title: 'Order Matters', text: 'Place a Flat + block BEFORE a Percent x block. (Multipliers scale base damage!)', requiredAction: 'order_check' },
  { id: 'crossover', title: 'Crossing Paths', text: 'Use a Crossover block to let two lanes cross without mixing their modifiers.', requiredAction: 'crossover' },
  { id: 'run', title: 'First Run', text: 'Your circuit is ready. Press FLY to start your first run.', requiredAction: 'start_run' },
  { id: 'done', title: 'Good Luck', text: 'Destroy the Mitotic Rocks. Good luck!' }
];

export class TutorialManager {
  currentStepIndex: number = 0;
  isActive: boolean = true;

  getCurrentStep(): TutorialStep | null {
    if (!this.isActive || this.currentStepIndex >= TUTORIAL_STEPS.length) return null;
    return TUTORIAL_STEPS[this.currentStepIndex];
  }

  advance() {
    if (this.isActive) {
      this.currentStepIndex++;
      if (this.currentStepIndex >= TUTORIAL_STEPS.length) {
        this.isActive = false;
      }
    }
  }

  skip() {
    this.isActive = false;
  }
}
