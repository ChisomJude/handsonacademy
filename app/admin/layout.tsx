import Link from 'next/link';
import {AdminSignOut} from '@/components/admin/admin-signout';

export default function AdminLayout({children}:{children:React.ReactNode}){
  return <><header className="admin-header"><Link href="/admin" className="admin-brand">HandsOn<span>.</span> Admin</Link><AdminSignOut/></header>{children}<style>{`.admin-header{height:68px;border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 clamp(18px,4vw,48px);background:#fff}.admin-brand{font-weight:800;font-size:19px;letter-spacing:-.05em;color:var(--ink);text-decoration:none}.admin-brand span{color:var(--accent)}.admin-signout{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);padding:9px 13px;font:600 12px Manrope;cursor:pointer}.admin-signout:hover{border-color:var(--brand);color:var(--brand)}`}</style></>
}
