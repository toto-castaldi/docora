import { NavLink } from "react-router";
import {
  LayoutDashboard,
  Boxes,
  AlertCircle,
  Clock,
  LogOut,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import styles from "./Sidebar.module.css";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Overview" },
  { to: "/apps", icon: Boxes, label: "Apps" },
  { to: "/notifications", icon: AlertCircle, label: "Notifications" },
  { to: "/queue", icon: Clock, label: "Queue" },
];

export function Sidebar() {
  const { username, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h1 className={styles.title}>Docora</h1>
        <p className={styles.subtitle}>Admin Dashboard</p>
      </div>

      <nav className={styles.nav}>
        <ul className={styles.navList}>
          {navItems.map((item) => (
            <li key={item.to} className={styles.navItem}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `${styles.navLink} ${isActive ? styles.navLinkActive : ""}`
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className={styles.footer}>
        <p className={styles.userInfo}>Logged in as: {username}</p>
        <button onClick={handleLogout} className={styles.logoutButton}>
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
