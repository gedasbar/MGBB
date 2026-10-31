import { Container, Graphics, Text } from 'pixi.js';
import { THEME } from './theme';
import { fmtBig } from './format';
import { makeText, UIButton } from '../builder/ui';
import { Rect, VIEW_W } from '../builder/layout';

/** The yellow coin and credit total in the top-right corner of the Build and Shop screens. */
export class CreditsBadge {
  readonly container = new Container();
  private money = makeText('0', 28, THEME.currency, { fontWeight: 'bold' });
  private coin = new Graphics();

  constructor() {
    this.money.anchor.set(1, 0.5);
    this.money.position.set(VIEW_W - 12, 27);
    this.container.addChild(this.coin, this.money);
    this.set(0);
  }

  set(credits: number) {
    this.money.text = fmtBig(credits);
    const coinX = VIEW_W - 12 - this.money.width - 10 - 18;
    this.coin.clear().rect(coinX, 18, 18, 18).fill(THEME.currency).rect(coinX + 5, 23, 8, 8).stroke({ color: THEME.panel, width: 2 });
  }

  get text(): string { return this.money.text; }
}

export type TextButton = UIButton & { setText(t: string): void };

/**
 * A sharp-cornered button with a centred label, in the same grey style as the Build toolbar:
 * light outline, inverted while pressed, greyed out when disabled.
 */
export function textButton(id: string, rect: Rect, label: string, onTap: () => void, size = 18): TextButton {
  let text: Text | null = null;
  const b = new UIButton({
    id, rect, onTap,
    draw: (g, bb) => {
      const off = !bb.enabled;
      g.rect(1, 1, rect.w - 2, rect.h - 2).fill(bb.lit ? THEME.pressedFill : THEME.buttonFill).stroke({ color: off ? THEME.disabled : THEME.buttonLine, width: 1.5 });
      if (text) text.style.fill = off ? THEME.disabled : bb.lit ? THEME.pressedIcon : THEME.text;
    },
  }) as TextButton;
  text = makeText(label, size, THEME.text, { fontWeight: 'bold', align: 'center' });
  text.anchor.set(0.5);
  text.position.set(rect.w / 2, rect.h / 2);
  b.container.addChild(text);
  b.setText = (t: string) => { text!.text = t; };
  b.redraw();
  return b;
}

/** Chunk 24a: the "SPIKE" badge of a harder level, a small red tag that sits inside the HUD box (WALL / Free Fly squares). */
export const SPIKE_BADGE = { w: 54, h: 18 };
export function makeSpikeBadge(): Container {
  const c = new Container();
  const bg = new Graphics().rect(0, 0, SPIKE_BADGE.w, SPIKE_BADGE.h).fill(THEME.bad);
  const t = makeText('SPIKE', 12, THEME.hullDark, { fontWeight: 'bold' });
  t.anchor.set(0.5);
  t.position.set(SPIKE_BADGE.w / 2, SPIKE_BADGE.h / 2);
  c.addChild(bg, t);
  return c;
}
