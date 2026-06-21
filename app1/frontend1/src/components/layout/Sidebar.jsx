import { useState, useEffect } from "react";
import { Redo2 } from "lucide-react";

const navItems = [
  { image: "/LayoutDashboard.svg", label: "Dashboard" },
  { image: "/MessageSquare.svg", label: "Messages" },
  { image: "/Calendar.svg", label: "Calendar" },
  { image: "/Zap.svg", label: "Integrations" },
  { image: "/Megaphone.svg", label: "Announcements" },
  { image: "/Monitor.svg", label: "Screens" },
];

export default function Sidebar() {
  const [active, setActive] = useState("Messages");
  const [user, setUser] = useState({ name: "Host User", email: "host@example.com", role: "Host" });

  useEffect(() => {
    const token = localStorage.getItem("token");
    let email = localStorage.getItem("email") || "host@example.com";
    let name = localStorage.getItem("name") || localStorage.getItem("username") || "Host User";
    let role = "Host";

    if (token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        const decoded = JSON.parse(jsonPayload);
        if (decoded.email) email = decoded.email;
        if (decoded.name) name = decoded.name;
        if (decoded.role) role = decoded.role;
      } catch (e) {
        console.warn("Could not decode token", e);
      }
    }
    setUser({ name, email, role: role === "host" || role === "super_admin" ? "Host" : role });
  }, []);

  return (
    <aside className="w-16 bg-gradient-to-b from-[#001744] via-[#002266] to-[#001030] flex flex-col items-center py-4 gap-6 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.15)] transition-all duration-300">
      
      {/* Top Button */}
      <div className="w-[44px] h-[44px] rounded-full bg-white flex items-center justify-center cursor-pointer hover:bg-gray-100 hover:scale-105 active:scale-95 hover:rotate-18 transition-all duration-300 shadow-sm">
        <Redo2 className="w-[20px] h-[20px] text-black" />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-2.5 flex-1">
        {navItems.map(({ image, label }) => {
          const isActive = active === label;
          return (
            <button
              key={label}
              onClick={() => setActive(label)}
              title={label}
              className={`w-[44px] h-[44px] rounded-xl flex items-center justify-center transition-all duration-300 relative group cursor-pointer ${
                isActive
                  ? "bg-white/20 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1),0_4px_12px_rgba(0,0,0,0.1)] scale-105"
                  : "hover:bg-white/10 hover:scale-105 active:scale-95"
              }`}
            >
              {/* Active indicator bar on the very left edge, taking no extra layout space */}
              {isActive && (
                <span className="absolute left-0 w-[3px] h-[16px] bg-white rounded-r-full transition-all duration-300" />
              )}
              
              <img
                src={image}
                alt={label}
                className={`w-[20px] h-[20px] transition-transform duration-300 ${
                  isActive ? "scale-110" : "group-hover:scale-115"
                }`}
              />
            </button>
          );
        })}
      </nav>

      {/* Profile Section - Enhanced with Hover Account Details */}
      <div className="w-[64px] h-[64px] flex items-center justify-center relative cursor-pointer group">
        <div className="w-[44px] h-[44px] flex items-center justify-center rounded-full bg-white/5 border border-white/10 group-hover:border-white/20 group-hover:scale-105 group-hover:ring-2 group-hover:ring-blue-400 group-hover:ring-offset-2 group-hover:ring-offset-[#001030] transition-all duration-300">
          <img
            src="profile.svg"
            alt="profile"
            className="w-[32px] h-[32px] rounded-full object-cover"
          />
        </div>

        {/* Hover Account Details Card */}
        <div className="absolute bottom-2 left-16 bg-white text-slate-800 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.18)] border border-slate-200/80 p-4 w-64 z-50 opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-300 origin-bottom-left flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-indigo-55 border border-indigo-100 flex items-center justify-center overflow-hidden shrink-0">
              <img
                src="profile.svg"
                alt="profile"
                className="w-10 h-10 rounded-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h4 className="font-extrabold text-slate-900 text-sm truncate">
                {user.name}
              </h4>
              <p className="text-slate-500 text-xs truncate">
                {user.email}
              </p>
            </div>
          </div>
          
          <div className="h-px bg-slate-100 w-full" />
          
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
              Role
            </span>
            <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
              {user.role}
            </span>
          </div>
        </div>
      </div>

    </aside>
  );
}