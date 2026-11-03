import { ScreenManager } from '../screens/ScreenManager';
import { BuildScreen } from '../screens/BuildScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { CaptainScreen } from '../screens/CaptainScreen';
import { SkillsScreen } from '../screens/SkillsScreen';
import { openMapTab } from './nav';

/** Chunk 29b: the bottom tab bar's targets in one place. The Map tab goes through the remembered mode (`openMapTab`). */
export function goToTab(sm: ScreenManager, id: string) {
  if (id === 'tabBuild') sm.switchTo(new BuildScreen(sm));
  else if (id === 'tabShop') sm.switchTo(new ShopScreen(sm));
  else if (id === 'tabCaptain') sm.switchTo(new CaptainScreen(sm));
  else if (id === 'tabSkills') sm.switchTo(new SkillsScreen(sm));
  else if (id === 'tabMap') openMapTab(sm);
}
