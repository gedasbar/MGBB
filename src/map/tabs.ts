import { ScreenManager } from '../screens/ScreenManager';
import { BuildScreen } from '../screens/BuildScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { CaptainScreen } from '../screens/CaptainScreen';
import { SkillsScreen } from '../screens/SkillsScreen';
import { openMapTab } from './nav';
import { inSandbox, leaveSandbox } from '../builder/session';

/** Chunk 29b: the bottom tab bar's targets in one place. The Map tab goes through the remembered mode (`openMapTab`). */
export function goToTab(sm: ScreenManager, id: string) {
  // Chunk 31c: the debug sandbox lasts through the Build and Map tabs (to build and fly); the screens that work on the real progress close it.
  if (inSandbox() && (id === 'tabShop' || id === 'tabCaptain' || id === 'tabSkills')) leaveSandbox();
  if (id === 'tabBuild') sm.switchTo(new BuildScreen(sm));
  else if (id === 'tabShop') sm.switchTo(new ShopScreen(sm));
  else if (id === 'tabCaptain') sm.switchTo(new CaptainScreen(sm));
  else if (id === 'tabSkills') sm.switchTo(new SkillsScreen(sm));
  else if (id === 'tabMap') openMapTab(sm);
}
