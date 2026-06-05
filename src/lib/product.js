export const productName = "广东综评";

export const productDescription =
  "面向广东高中生的综合评价招生指南、时间线、综合分计算器和结构化面经平台。";

export const studentNavigation = [
  { href: "/", label: "首页", key: "home", icon: "home" },
  { href: "/schools", label: "院校", key: "schools", icon: "school" },
  { href: "/experiences", label: "面经", key: "experiences", icon: "experience" },
  { href: "/me", label: "我的", key: "me", icon: "user" }
];

export const adminNavigation = [
  { href: "/admin", label: "总览", key: "overview" },
  { href: "/admin/ingestion-runs", label: "AI 入库", key: "ingestion" },
  { href: "/admin/guides", label: "简章审核", key: "guides" },
  { href: "/admin/timeline", label: "时间线管理", key: "timeline" },
  { href: "/admin/formulas", label: "公式管理", key: "formulas" },
  { href: "/admin/experiences", label: "面经审核", key: "experiences" },
  { href: "/admin/verifications", label: "认证审核", key: "verifications" },
  { href: "/admin/reports", label: "举报处理", key: "reports" }
];
