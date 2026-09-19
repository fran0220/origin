import type { SidebarNavItemButton, SidebarNavigationProps } from "@origin-org/theme-ui/sidebar";
import type { ComponentType } from "react";

export type {
	NavIndicatorBounds,
	SidebarNavItem,
} from "@origin-org/theme-sdk/sidebar";
export type { SidebarNavItemButtonProps, SidebarNavigationProps } from "@origin-org/theme-ui/sidebar";
export { SidebarNavItemButton, SidebarNavigation } from "@origin-org/theme-ui/sidebar";

declare module "@origin-org/theme-sdk" {
	interface ThemeComponentRegistry {
		readonly "sidebar.navItem"?: typeof SidebarNavItemButton;
		readonly "sidebar.navigation"?: ComponentType<SidebarNavigationProps>;
	}
}
