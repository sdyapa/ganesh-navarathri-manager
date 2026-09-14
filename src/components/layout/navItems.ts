export interface NavItem {
  to: string
  label: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '🏠' },
  { to: '/donations', label: 'Donations', icon: '🎁' },
  { to: '/expenses', label: 'Expenses', icon: '🧾' },
  { to: '/auctions', label: 'Auctions', icon: '🔨' },
  { to: '/tasks', label: 'Tasks', icon: '📝' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/inventory', label: 'Inventory', icon: '📦' },
  { to: '/reports', label: 'Reports', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]
