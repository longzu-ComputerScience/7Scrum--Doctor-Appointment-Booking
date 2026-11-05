import type { ReactNode } from "react";

const paths = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18M8 15h2m4 0h2m-8 3h2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
  home: <path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7" />,
  logout: <path d="M9 4H4v16h5m6-13 5 5-5 5M8 12h12" />,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5 8a8 8 0 0 1 14-2l1 6M4 12l1 6a8 8 0 0 0 14-2" /></>,
} satisfies Record<string, ReactNode>;

export function StaffIcon({ name }: { name: keyof typeof paths }) {
  return <svg className="dash-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}
