'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_LINKS = [
  { href: '/', label: 'Zip Builder' },
  { href: '/utility', label: 'Utility Map' },
];

/**
 * Shared presentational header: title + nav tabs on the left, page-specific
 * action buttons passed as children on the right.
 */
export default function AppHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <header className="app-header">
      <div className="app-header-left">
        <span className="app-header-title">{title}</span>
        <nav className="header-nav">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`header-nav-link${pathname === link.href ? ' active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="app-header-actions">{children}</div>
    </header>
  );
}
