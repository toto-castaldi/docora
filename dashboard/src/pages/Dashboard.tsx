// Dashboard.tsx now re-exports Overview for backward compatibility
// The route "/" uses Dashboard, which renders Overview content
export { Overview as Dashboard } from "./Overview";
