// Runs before first paint (loaded from index.html) so theme and accessibility
// preferences apply without a flash. The scripts are plain strings so the
// same source is also usable in other shells.
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import { A11Y_INIT_SCRIPT } from "@/lib/a11y";

new Function(THEME_INIT_SCRIPT + A11Y_INIT_SCRIPT)();
