import { NavLink } from 'react-router-dom';

const tabs = [
  { to: '/batch-review', label: '任务中心', end: true },
  { to: '/batch-review/new', label: '新建任务' },
  { to: '/batch-review/notifications', label: '通知' },
];

export default function BatchReviewBottomNav() {
  return (
    <nav aria-label="批量批改导航" className="batch-bottom-nav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            isActive ? 'batch-bottom-nav__item is-active' : 'batch-bottom-nav__item'
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
