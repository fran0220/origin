export type DesktopSidebarPlacement =
	| { readonly kind: "default" }
	| { readonly kind: "project"; readonly projectPath: string };
