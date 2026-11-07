/**
 * The `show_day_screen` setting: whether the Day screen has a place in the sidebar (and in the
 * phone's tabs). One setting on the account, off until someone turns it on. The screen itself is
 * never removed; this only decides whether it is offered.
 */
export function showDayScreen(settings: Record<string, unknown>): boolean {
  return settings.show_day_screen === true;
}
