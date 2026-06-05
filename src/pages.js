import {
  getSchoolDetail,
  getSchoolById,
  listExperiences,
  listGuides,
  listSchoolGuideCards,
  listTimelineNodes,
  timelineEventDefinitions
} from "./db/data-access.js";
import {
  adminNavigation,
  productDescription,
  productName,
  studentNavigation
} from "./lib/product.js";

const entryPoints = [
  {
    badge: "G1",
    title: "高一",
    body: "先建立参评院校、校测形式和选科要求的基础认知。"
  },
  {
    badge: "G2",
    title: "高二",
    body: "在报名前比较近年简章变化、时间节奏和已认证面经规律。"
  },
  {
    badge: "G3",
    title: "高三",
    body: "跟踪当年简章、关键日期、公式可用性和校测准备信息。"
  }
];

const workflowPlaceholders = [
  { title: "AI 入库", status: "草稿流转已启用" },
  { title: "简章审核", status: "官方来源审核已启用" },
  { title: "时间线管理", status: "人工覆盖流程已启用" },
  { title: "公式管理", status: "草稿发布流程已启用" },
  { title: "面经审核", status: "内容审核已启用" },
  { title: "认证审核", status: "材料元数据审核已启用" },
  { title: "举报处理", status: "处理闭环已启用" }
];

const zhDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC"
});

const importantEventKeys = new Set([
  "application_deadline",
  "confirmation_or_payment",
  "school_assessment",
  "shortlist_publication",
  "volunteer_application",
  "admission_publication"
]);

const missingOfficialText = "官方未明确";
const pendingSupplementText = "待补充";

const tokenLabels = Object.freeze({
  active: "进行中",
  admission_guide: "招生简章",
  admission_publication: "录取公布",
  application_deadline: "报名截止",
  application_portal: "报名入口",
  application_start: "报名开始",
  archived: "历史参考",
  candidate: "候选",
  closed: "已结束",
  confirmation_or_payment: "确认或缴费",
  content_reviewer: "内容审核员",
  custom: "自定义",
  data_reviewer: "数据审核员",
  draft: "草稿",
  due_soon: "即将截止",
  education_exam_authority: "教育考试院",
  ended: "已结束",
  experience: "面经",
  failed: "失败",
  guide_publication: "简章发布",
  group_discussion: "小组讨论",
  hidden: "已隐藏",
  history: "历史类",
  machine_test: "机试",
  manual_upload: "人工上传",
  not_started: "未开始",
  official_notice: "官方通知",
  open: "开放报名",
  pending: "待处理",
  pending_review: "待审核",
  physics: "物理类",
  preliminary_review_result: "初审结果",
  published: "已发布",
  rejected: "已拒绝",
  research_university: "研究型大学",
  running: "运行中",
  school_assessment: "校测",
  shortlist_publication: "入围名单",
  structured_interview: "结构化面试",
  succeeded: "已完成",
  user: "普通用户",
  verified: "已认证",
  volunteer_application: "志愿填报",
  weighted_sum: "加权求和"
});

const htmlTranslations = Object.freeze([
  ["Guangdong Comprehensive Evaluation", "广东综合评价招生"],
  ["Guangdong CE", "广东综评"],
  ["High school grade one", "高一"],
  ["High school grade two", "高二"],
  ["High school grade three", "高三"],
  ["Use your grade to move quickly between schools, dates, score tools, and structured experiences.", "按年级快速查看院校、时间节点、综合分工具和结构化面经。"],
  ["Core student tasks", "核心任务"],
  ["Browse schools", "查院校"],
  ["Key dates", "看时间线"],
  ["Calculate score", "算综合分"],
  ["Read stories", "看面经"],
  ["Nearest timeline nodes", "最近时间节点"],
  ["Site-wide published nodes", "全站已发布节点"],
  ["Favorited schools", "已收藏院校"],
  ["Log in to favorite schools and view your personal timeline.", "登录后可收藏院校并查看个人时间线。"],
  ["Latest guides", "最新简章"],
  ["All schools", "全部院校"],
  ["Latest experiences", "最新面经"],
  ["All experiences", "全部面经"],
  ["Grade preparation tips", "年级准备建议"],
  ["Grade switch", "年级切换"],
  ["Watch current guide releases.", "关注当年简章发布。"],
  ["Keep deadline and confirmation dates visible.", "留意报名截止、确认和缴费时间。"],
  ["Prepare school assessment examples.", "准备校测可用的经历和案例。"],
  ["Understand the comprehensive evaluation path.", "了解综评整体路径。"],
  ["Check academic test and subject requirements.", "核对学考和选科要求。"],
  ["Build a baseline view of participating schools, assessment formats, and subject requirement signals.", "先建立参评院校、校测形式和选科要求的基础认知。"],
  ["Compare recent guide changes, timeline rhythm, and verified experience patterns before application year.", "在报名前比较近年简章变化、时间节奏和已认证面经规律。"],
  ["Track current guide releases, important dates, score formula availability, and assessment preparation details.", "跟踪当年简章、关键日期、公式可用性和校测准备信息。"],
  ["School keyword", "院校关键词"],
  ["Schools", "院校"],
  ["Search school", "搜索院校"],
  ["Visible school filters", "院校筛选"],
  ["All years", "全部年份"],
  ["Year", "年份"],
  ["Guide status", "简章状态"],
  ["All guide statuses", "全部简章状态"],
  ["Waiting publication", "待发布"],
  ["Historical reference", "历史参考"],
  ["Application status", "报名状态"],
  ["All application statuses", "全部报名状态"],
  ["School type", "院校类型"],
  ["All school types", "全部院校类型"],
  ["Sort", "排序"],
  ["Application deadline", "报名截止"],
  ["Update time", "更新时间"],
  ["School name", "院校名称"],
  ["Apply", "应用"],
  ["Clear", "清空"],
  ["Selected school filters", "已选院校筛选"],
  ["Showing all published school guide cards.", "正在展示全部已发布院校简章卡片。"],
  ["Clear filters", "清空筛选"],
  ["No matching schools", "没有匹配院校"],
  ["No schools match these filters. Try switching year or status.", "当前筛选没有匹配院校，可以切换年份或状态。"],
  ["No formula", "无明确公式"],
  ["Deadline", "截止时间"],
  ["Formula", "公式"],
  ["Experiences", "面经"],
  ["Application", "报名"],
  ["Key timeline", "关键时间线"],
  ["View school detail", "查看院校详情"],
  ["School list", "院校列表"],
  ["School filters", "院校筛选"],
  ["School quick actions", "院校快捷操作"],
  ["Open filters", "打开筛选"],
  ["Open school filters", "打开院校筛选"],
  ["Open experience filters", "打开面经筛选"],
  ["Go back", "返回"],
  ["Back to schools", "返回院校"],
  ["Back to experiences", "返回面经"],
  ["Favorite school", "收藏院校"],
  ["Favorite school action", "收藏院校操作"],
  ["Favorite experience", "收藏面经"],
  ["Official source", "官方来源"],
  ["Official source basis", "官方依据"],
  ["Open source", "打开来源"],
  ["Source-backed formula", "有官方来源的公式"],
  ["Weights and max scores", "权重与满分"],
  ["Comprehensive score", "综合分"],
  ["Contribution breakdown", "分项贡献"],
  ["Score Calculator", "综合分计算器"],
  ["Score calculator", "综合分计算器"],
  ["Step 1", "步骤 1"],
  ["Step 2", "步骤 2"],
  ["Step 3", "步骤 3"],
  ["Choose school and year", "选择院校和年份"],
  ["Enter scores", "输入分数"],
  ["View results", "查看结果"],
  ["Calculate", "计算"],
  ["No published formula is available for this school year.", "该院校年份暂无已发布公式。"],
  ["No published formula. Score calculation waits for official clarification.", "暂无已发布公式，综合分计算等待官方明确。"],
  ["No clear published formula", "暂无明确已发布公式"],
  ["Calculation form is hidden", "计算表单已隐藏"],
  ["This calculation follows published formula fields for reference only and is not an admission probability.", "本计算仅按已发布公式字段提供参考，不代表录取概率。"],
  ["Verification pending", "认证待审核"],
  ["Verified experience", "已认证面经"],
  ["Historical reference notice", "历史参考提示"],
  ["Useful count", "有用数"],
  ["Mark useful", "标记有用"],
  ["Report", "举报"],
  ["Submit report", "提交举报"],
  ["Login", "登录"],
  ["Phone OTP", "手机号验证码"],
  ["Login Guangdong CE", "登录广东综评"],
  ["Log in to favorite schools, publish experiences, and track review status.", "登录后可收藏院校、发布面经并跟踪审核状态。"],
  ["I agree to the user agreement and privacy policy.", "我同意用户协议和隐私政策。"],
  ["Agreement consent is required before login.", "登录前必须同意协议。"],
  ["Verification code is invalid. Please re-enter.", "验证码错误，请重新输入。"],
  ["Login guide", "登录引导"],
  ["Log in to use My page", "登录后使用我的页面"],
  ["Login enables school favorites, experience publishing, and review-status tracking.", "登录后可使用院校收藏、面经发布和审核状态跟踪。"],
  ["Save Guangdong comprehensive evaluation schools for a personal timeline.", "收藏广东综评院校，生成个人时间线。"],
  ["My", "我的"],
  ["School favorites", "院校收藏"],
  ["Experience favorites", "面经收藏"],
  ["No favorited schools yet.", "还没有收藏院校。"],
  ["No favorited experiences yet.", "还没有收藏面经。"],
  ["No site reminders for favorited schools or submitted experiences right now.", "当前没有院校收藏或投稿相关站内提醒。"],
  ["Account settings", "账号设置"],
  ["Preferences updated", "偏好已更新"],
  ["Logout", "退出登录"],
  ["Admin console", "管理后台"],
  ["Admin", "管理"],
  ["Admin left navigation", "管理端左侧导航"],
  ["Admin global status bar", "管理端全局状态栏"],
  ["Admin main content", "管理端主内容"],
  ["Student bottom navigation", "学生底部导航"],
  ["Global status: manual review required before student-visible changes", "全局状态：学生可见变更前必须人工审核"],
  ["Signed in as", "当前登录"],
  ["Detail drawer", "详情面板"],
  ["Action bar", "操作区"],
  ["Student-visible preview", "学生端预览"],
  ["Student-side preview", "学生端预览"],
  ["Audit requirement", "审计要求"],
  ["Data Ingestion", "AI 入库"],
  ["Guide Review", "简章审核"],
  ["Timeline Management", "时间线管理"],
  ["Formula Management", "公式管理"],
  ["Experience Review", "面经审核"],
  ["Verification Review", "认证审核"],
  ["Report Handling", "举报处理"],
  ["Overview", "总览"],
  ["Published guide", "已发布简章"],
  ["Published guides", "已发布简章"],
  ["Published experiences", "已发布面经"],
  ["Published official data", "已发布官方数据"],
  ["Published", "已发布"],
  ["Returned", "已退回"],
  ["Hidden", "已隐藏"],
  ["Draft", "草稿"],
  ["Visible to students", "学生端可见"],
  ["Guide releases and deadlines", "简章发布与截止节点"],
  ["Structured student references", "结构化学生参考"],
  ["Official not specified", "官方未明确"],
  ["Pending supplement", "待补充"],
  ["To be announced", "待公布"],
  ["Not Started", "未开始"],
  ["Due Soon", "即将截止"],
  ["Ended", "已结束"],
  ["Active", "进行中"],
  ["Application start", "报名开始"],
  ["Preliminary review result", "初审结果"],
  ["Shortlist publication", "入围名单"],
  ["Official guide summary", "官方简章摘要"],
  ["Official guide", "官方简章"],
  ["School quick actions", "院校快捷操作"],
  ["Application link", "报名链接"],
  ["Expand official summary", "展开官方摘要"],
  ["Application window", "报名时间"],
  ["Updated", "更新于"],
  ["Assessment", "考核"],
  ["Assessment format", "考核形式"],
  ["Subject requirements", "选科要求"],
  ["Academic test requirements", "学考要求"],
  ["Admission requirements", "报名要求"],
  ["Registration conditions", "报名条件"],
  ["Majors", "招生专业"],
  ["Assessment method", "考核方式"],
  ["Assessment and admission", "考核与录取"],
  ["Admission rule", "录取规则"],
  ["Fees and consultation", "费用与咨询"],
  ["Featured experiences", "精选面经"],
  ["Expand", "展开"],
  ["Application:", "报名费："],
  ["Assessment:", "考核费："],
  ["Phone:", "电话："],
  ["Email:", "邮箱："],
  ["CNY", "元"],
  ["Current cycle", "当前周期"],
  ["Timeline progress", "时间线进度"],
  ["school", "所院校"],
  ["schools", "所院校"],
  ["node", "个节点"],
  ["nodes", "个节点"],
  ["story", "条面经"],
  ["stories", "条面经"],
  ["experience", "条面经"],
  ["experiences", "条面经"],
  ["Select school", "选择院校"],
  ["Select year", "选择年份"],
  ["Select score", "选择分值"],
  ["Select track", "选择科类"],
  ["Select stage", "选择阶段"],
  ["Select status", "选择状态"],
  ["Experience list", "面经列表"],
  ["Experience keyword", "面经关键词"],
  ["Search school, stage, or keyword", "搜索院校、阶段或关键词"],
  ["Verified status", "认证状态"],
  ["Basic information", "基本信息"],
  ["Question-type categories", "问题类型分类"],
  ["Preparation and advice", "准备与建议"],
  ["Experience ratings", "面经评分"],
  ["Useful", "有用"],
  ["Experiment Design", "实验设计"],
  ["Physics", "物理类"],
  ["physics", "物理类"],
  ["History", "历史类"],
  ["history", "历史类"],
  ["General", "通用"],
  ["Preliminary review", "初审"],
  ["Admission result", "录取结果"],
  ["Shortlisted status", "入围状态"],
  ["Shortlisted", "已入围"],
  ["Not shortlisted", "未入围"],
  ["Admitted status", "录取状态"],
  ["Not disclosed", "未披露"],
  ["Admitted", "已录取"],
  ["Not admitted", "未录取"],
  ["Structured interview", "结构化面试"],
  ["Group discussion", "小组讨论"],
  ["Machine test", "机试"],
  ["Materials review", "材料审核"],
  ["Practical task", "实践任务"],
  ["Motivation", "报考动机"],
  ["Current affairs", "时事议题"],
  ["Major interest", "专业兴趣"],
  ["Experiment design", "实验设计"],
  ["Project reflection", "项目复盘"],
  ["Math reasoning", "数学推理"],
  ["Teamwork", "团队协作"],
  ["Learning plan", "学习计划"],
  ["Structured submission", "结构化投稿"],
  ["Submit experience", "发布面经"],
  ["Submit", "提交"],
  ["Back to experiences", "返回面经"],
  ["Review after submit", "提交后审核"],
  ["Record school assessment details, preparation signals, and optional verification metadata for reviewer approval.", "记录校测过程、准备经验和可选认证材料元数据，提交审核后再公开。"],
  ["Saved draft found from this device.", "发现本设备保存的草稿。"],
  ["Restore draft", "恢复草稿"],
  ["Clear draft", "清除草稿"],
  ["Experience submission form", "面经投稿表单"],
  ["School and result", "院校与结果"],
  ["School", "院校"],
  ["Major group", "专业组"],
  ["Candidate track", "考生科类"],
  ["Stage", "阶段"],
  ["Location", "地点"],
  ["Assessment details", "考核详情"],
  ["Assessment types", "考核类型"],
  ["Process", "流程"],
  ["Question types", "问题类型"],
  ["Preparation", "准备"],
  ["Scores and advice", "评分与建议"],
  ["Difficulty score", "难度评分"],
  ["Pressure score", "压力评分"],
  ["Differentiation score", "区分度评分"],
  ["Anonymous preference", "匿名偏好"],
  ["Anonymous display", "匿名展示"],
  ["Show nickname", "展示昵称"],
  ["Advice", "建议"],
  ["Verification metadata", "认证材料元数据"],
  ["Verification metadata helps reviewers check authenticity. It stays reviewer-only and is not shown on student pages.", "认证材料元数据用于帮助审核员核验真实性，仅审核端可见，不会展示在学生端。"],
  ["Material type", "材料类型"],
  ["Storage key", "存储键"],
  ["Advice is required", "建议为必填项"],
  ["required", "必填"],
  ["Pending review", "待审核"],
  ["verification metadata record", "条认证材料元数据"],
  ["metadata records", "条认证材料元数据"],
  ["Display", "展示身份"],
  ["Timeline", "时间线"],
  ["Guangdong timeline", "广东综评时间线"],
  ["All Nodes", "全部节点"],
  ["My Favorites", "我的收藏"],
  ["My timeline", "我的时间线"],
  ["Node type", "节点类型"],
  ["Site reminder", "站内提醒"],
  ["Collect schools to build My Favorites", "收藏院校后生成我的时间线"],
  ["Source guide year", "来源简章年份"],
  ["Score inputs", "成绩输入"],
  ["Result will appear after calculation.", "计算后将在这里显示结果。"],
  ["Calculate score", "计算综合分"],
  ["Calculating...", "正在计算..."],
  ["Data ingestion", "AI 入库"],
  ["Create ingestion run", "创建入库任务"],
  ["Source candidates", "来源候选"],
  ["Extraction confidence", "抽取置信度"],
  ["Draft guide", "简章草稿"],
  ["Manual review required", "需要人工审核"],
  ["No timeline candidates stored.", "暂无时间线候选。"],
  ["No formula candidates stored.", "暂无公式候选。"],
  ["Source priority", "来源优先级"],
  ["Official source preview or link", "官方来源预览或链接"],
  ["Official source attribution", "官方来源归因"],
  ["Official source checked; missing fields are marked for students.", "已核对官方来源，缺失字段会向学生标注。"],
  ["Official notice checked and date/title corrected", "已核对官方通知并修正日期/标题"],
  ["Official source URL", "官方来源链接"],
  ["Official source linked", "已关联官方来源"],
  ["Source required", "需要来源"],
  ["Publication requirement", "发布要求"],
  ["Official source and publication gate", "官方来源与发布门槛"],
  ["At least one sample calculation passed", "至少一个样例计算已通过"],
  ["A passing sample calculation is required", "需要一个通过的样例计算"],
  ["Test sample area", "样例测试区"],
  ["Approval is blocked when rewrite-required warnings are present", "存在需改写风险提示时禁止通过"],
  ["Reason required when refusing verification", "拒绝认证时必须填写原因"],
  ["Explain why the verification material is rejected or returned.", "说明认证材料被拒绝或退回的原因。"],
  ["Guide review queue", "简章审核队列"],
  ["Guide review queue table", "简章审核队列表"],
  ["Missing fields", "缺失字段"],
  ["Extracted fields", "抽取字段"],
  ["Field-level confirmation state", "字段级确认状态"],
  ["Submit review", "提交审核"],
  ["Publish", "发布"],
  ["Return", "退回"],
  ["Archive", "归档"],
  ["Timeline overrides", "时间线覆写"],
  ["Timeline management generated nodes table", "时间线管理生成节点表"],
  ["Date precision", "日期精度"],
  ["Student status", "学生端状态"],
  ["Original generated data", "原始生成数据"],
  ["Manual override state", "人工覆写状态"],
  ["Override reason", "覆写原因"],
  ["Save override", "保存覆写"],
  ["Score formula drafts", "综合分公式草稿"],
  ["Formula editor", "公式编辑器"],
  ["Formula management list table", "公式管理列表表格"],
  ["Formula configuration", "公式配置"],
  ["Publish formula", "发布公式"],
  ["Ingestion draft workflow", "入库草稿流程"],
  ["Data ingestion task list", "数据入库任务列表"],
  ["Created by", "创建人"],
  ["Source document candidates", "来源文档候选"],
  ["Traceable extracted guide fields", "可追溯抽取简章字段"],
  ["Manual-confirmation items", "人工确认项"],
  ["Draft-guide creation", "简章草稿创建"],
  ["Hidden until manual guide review publishes it", "人工简章审核发布前保持隐藏"],
  ["Experience moderation queue", "面经审核队列"],
  ["Experience moderation", "面经审核"],
  ["Experience moderation filters", "面经审核筛选"],
  ["Experience moderation pending queue", "面经待审核队列"],
  ["Review pending structured experiences, prohibited-content signals, and privacy warnings before student publication.", "审核待处理结构化面经、违规内容信号和隐私风险后再向学生发布。"],
  ["experiences in moderation", "条面经待审核"],
  ["Sensitive content and privacy warnings", "敏感内容与隐私警告"],
  ["Sensitive risk tags", "敏感风险标签"],
  ["Verification privacy warning", "认证隐私警告"],
  ["Blocked content boundaries", "禁止内容边界"],
  ["Experience review detail", "面经审核详情"],
  ["Year and stage", "年份和阶段"],
  ["Public summary", "公开摘要"],
  ["Verification label", "认证标签"],
  ["Submitted structured fields", "已提交结构化字段"],
  ["Summary", "摘要"],
  ["Warning", "警告"],
  ["Review Private Material", "复核私密材料"],
  ["Ongoing-exam content, undisclosed original questions, sales, ghostwriting, guaranteed admission claims, external traffic scams, and personal sensitive information must be returned, hidden, or account-limited before publication.", "正在进行的考试内容、未公开原题、售卖代写、保录承诺、外部引流诈骗和个人敏感信息必须在发布前退回、隐藏或限制账号。"],
  ["Moderation audit", "审核记录"],
  ["No review operations recorded.", "暂无审核操作记录。"],
  ["Reason for return, hide, or account limit", "退回、隐藏或限制账号原因"],
  ["Explain the rewrite request or risk decision for the audit trail.", "说明改写要求或风险处理决定，用于审计留痕。"],
  ["Experience moderation actions", "面经审核操作"],
  ["Approve", "通过"],
  ["Return for rewrite", "退回重写"],
  ["Hide", "隐藏"],
  ["Status", "状态"],
  ["Reset", "重置"],
  ["Banned", "已封禁"],
  ["Submitted", "提交时间"],
  ["Detail", "详情"],
  ["Verification material queue", "认证材料队列"],
  ["Verification material queue table", "认证材料队列表"],
  ["Backend-only material preview", "仅后端可见材料预览"],
  ["Student-side verification label preview", "学生端认证标签预览"],
  ["Report resolution queue", "举报处理队列"],
  ["Report handling list table", "举报处理列表表格"],
  ["Report reason", "举报原因"],
  ["Target preview", "对象预览"],
  ["History and operator record", "历史与操作记录"],
  ["Resolution notes are required for every report action", "每个举报处理动作都必须填写处理说明"],
  ["Record why the report is kept, rejected, hidden, deleted, or account-limited.", "记录保留、驳回、隐藏、删除或限制账号的原因。"],
  ["No reports match this queue.", "当前队列没有匹配举报。"],
  ["No report selected.", "未选择举报。"],
  ["Open detail drawer", "打开详情面板"],
  ["Keep content", "保留内容"],
  ["Keep target", "保留对象"],
  ["Hide content", "隐藏内容"],
  ["Delete display", "删除展示"],
  ["Limit account", "限制账号"],
  ["Reject report", "驳回举报"],
  ["Target id", "对象 ID"],
  ["Report id", "举报 ID"],
  ["Description", "说明"],
  ["Operator", "操作人"],
  ["Operation time", "操作时间"],
  ["Resolved", "已处理"],
  ["Created", "创建时间"],
  ["Reason", "原因"],
  ["Note", "备注"],
  ["Action", "操作"],
  ["Currently visible", "当前可见"],
  ["Not student-visible", "学生端不可见"],
  ["No resolution recorded", "暂无处理记录"],
  ["Published school", "已发布院校"]
]);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeScriptJson(value) {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function formatDate(value) {
  if (!value) {
    return "待公布";
  }

  return zhDateFormatter.format(new Date(value));
}

function timestampFor(value) {
  const timestamp = Date.parse(value ?? "");
  return Number.isNaN(timestamp) ? null : timestamp;
}

function eventTimestamp(event) {
  return timestampFor(event.endsAt) ?? timestampFor(event.startsAt);
}

function pluralize(count, singular, plural = `${singular}s`) {
  return count === 1 ? singular : plural;
}

function humanizeToken(value) {
  if (Object.hasOwn(tokenLabels, value)) {
    return tokenLabels[value];
  }

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value, fallback = missingOfficialText) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : fallback;
  }

  if (value === 0) {
    return "0";
  }

  if (!value) {
    return fallback;
  }

  return String(value);
}

function schoolNameFor(record) {
  return getSchoolById(record.schoolId)?.name ?? "已发布院校";
}

function currentAdmissionYear(guides) {
  return guides.reduce((latestYear, guide) => Math.max(latestYear, guide.admissionYear), 0);
}

function nearestImportantEvents(events, referenceDate = new Date()) {
  const now = referenceDate.getTime();
  const importantEvents = events
    .filter((event) => importantEventKeys.has(event.eventKey))
    .map((event) => ({ event, timestamp: eventTimestamp(event) }))
    .filter((item) => item.timestamp !== null);

  const upcomingEvents = importantEvents
    .filter((item) => item.timestamp >= now)
    .sort((left, right) => left.timestamp - right.timestamp);
  const recentEvents = importantEvents
    .filter((item) => item.timestamp < now)
    .sort((left, right) => right.timestamp - left.timestamp);

  return [...upcomingEvents, ...recentEvents].slice(0, 3).map((item) => item.event);
}

function highQualityExperiences(experiences) {
  return [...experiences]
    .sort((left, right) => {
      const verifiedDifference =
        Number(right.verificationStatus === "verified") - Number(left.verificationStatus === "verified");

      if (verifiedDifference !== 0) {
        return verifiedDifference;
      }

      if (right.createdAt !== left.createdAt) {
        return right.createdAt.localeCompare(left.createdAt);
      }

      return right.usefulCount - left.usefulCount;
    })
    .slice(0, 3);
}

function htmlPage({ title, body }) {
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(productDescription)}">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
${body}
  </body>
</html>`;

  return translateHtml(html);
}

function translateHtml(html) {
  return html
    .split(/(<script\b[\s\S]*?<\/script>)/gi)
    .map((part) => {
      if (part.toLowerCase().startsWith("<script")) {
        return part;
      }

      return translateHtmlFragment(part);
    })
    .join("");
}

function translateHtmlFragment(html) {
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => {
      if (!part.startsWith("<")) {
        return translateTextSegment(part);
      }

      return part.replace(
        /\b(aria-label|placeholder|title|content)="([^"]*)"/g,
        (match, attribute, value) => `${attribute}="${translateTextSegment(value)}"`
      );
    })
    .join("");
}

function translateTextSegment(text) {
  return [...htmlTranslations]
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((translated, [source, target]) => translated.replaceAll(source, target), text);
}

function renderIcon(name) {
  const icons = {
    back: `<path d="M15 18l-6-6 6-6"></path>`,
    calculator: `<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 7h8"></path><path d="M8 11h.01"></path><path d="M12 11h.01"></path><path d="M16 11h.01"></path><path d="M8 15h.01"></path><path d="M12 15h.01"></path><path d="M16 15h.01"></path>`,
    calendar: `<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M4 10h16"></path>`,
    filter: `<path d="M4 6h16"></path><path d="M7 12h10"></path><path d="M10 18h4"></path>`,
    heart: `<path d="M12 21s-7-4.4-9-8.4C1.3 9.1 3.4 5 7.2 5c2 0 3.5 1.1 4.8 2.7C13.3 6.1 14.8 5 16.8 5c3.8 0 5.9 4.1 4.2 7.6C19 16.6 12 21 12 21z"></path>`,
    home: `<path d="M4 10.5 12 4l8 6.5"></path><path d="M6.5 10v9h11v-9"></path><path d="M10 19v-5h4v5"></path>`,
    login: `<path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M14 4h4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-4"></path>`,
    school: `<path d="M4 6h16v13H4z"></path><path d="M8 10h8"></path><path d="M8 14h5"></path>`,
    experience: `<path d="M5 5h14v12H8l-3 3z"></path><path d="M8.5 9h7"></path><path d="M8.5 13h5"></path>`,
    user: `<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></path><path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>`
  };

  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" focusable="false">${icons[name] ?? icons.home}</svg>`;
}

function renderStudentNav(currentKey = "") {
  return studentNavigation
    .map((item) => {
      const isCurrent = item.key === currentKey;
      const current = isCurrent ? ` aria-current="page"` : "";

      return `<a class="student-nav-item${isCurrent ? " active" : ""}" href="${escapeHtml(item.href)}"${current}>
        ${renderIcon(item.icon)}
        <span>${escapeHtml(item.label)}</span>
      </a>`;
    })
    .join("");
}

function renderStudentBottomNav(currentKey = "") {
  return `<nav class="student-bottom-nav" aria-label="学生底部导航" data-student-bottom-nav="true">${renderStudentNav(currentKey)}</nav>`;
}

function renderGradeSwitch(currentGrade = "high_school_g3") {
  const grades = [
    ["high_school_g1", "高一"],
    ["high_school_g2", "高二"],
    ["high_school_g3", "高三"]
  ];

  return `<div class="grade-switch" aria-label="年级切换" role="group">
    ${grades
      .map(([grade, label]) => {
        const current = grade === currentGrade ? ` aria-current="page"` : "";
        return `<a href="/?grade=${escapeHtml(grade)}"${current}>${escapeHtml(label)}</a>`;
      })
      .join("")}
  </div>`;
}

function renderIconLink({ href, label, icon }) {
  return `<a class="icon-button" href="${escapeHtml(href)}" aria-label="${escapeHtml(label)}">${renderIcon(icon)}</a>`;
}

function renderFavoriteSchoolAction(schoolId, returnTo = "/schools") {
  return renderFavoriteSchoolForm(schoolId, returnTo);
}

function renderStudentTopBar({
  type = "list",
  title,
  backHref = "",
  backLabel = "返回",
  actionHtml = "",
  filterHref = "",
  filterLabel = "打开筛选",
  submitState = ""
}) {
  const backEntry = backHref ? renderIconLink({ href: backHref, label: backLabel, icon: "back" }) : "";
  const actions = actionHtml ||
    (filterHref ? renderIconLink({ href: filterHref, label: filterLabel, icon: "filter" }) : "") ||
    (submitState ? `<span class="top-state">${escapeHtml(submitState)}</span>` : "");

  return `<header class="student-top-bar student-top-bar-${escapeHtml(type)}" data-student-top-bar="${escapeHtml(type)}">
    <div class="student-top-leading">
      ${backEntry}
      <div class="student-title-copy">
        ${type === "home" ? `<span class="top-kicker">Guangdong CE</span>` : ""}
        <span class="student-top-title">${escapeHtml(title)}</span>
      </div>
    </div>
    <div class="student-top-actions">${actions}</div>
  </header>`;
}

function renderStudentPage({
  title,
  currentKey = "",
  topBar,
  content,
  hideBottomNav = false,
  mainClass = ""
}) {
  return htmlPage({
    title,
    body: `    <div class="student-frame${hideBottomNav ? " student-task-frame" : ""}">
      ${topBar}
      <main class="app-shell student-main${mainClass ? ` ${escapeHtml(mainClass)}` : ""}">
${content}
      </main>
      <div class="student-toast" role="status" aria-live="polite" hidden data-student-toast="true"></div>
      ${hideBottomNav ? "" : renderStudentBottomNav(currentKey)}
      <script src="/student.js" defer></script>
    </div>`
  });
}

function renderAdminNav(currentKey = "") {
  return adminNavigation
    .map((item) => `<a class="admin-nav-link" href="${escapeHtml(item.href)}"${item.key === currentKey ? ` aria-current="page"` : ""}>
      <span>${escapeHtml(item.label)}</span>
    </a>`)
    .join("");
}

function renderAdminShell({
  title,
  currentKey,
  eyebrow,
  heading,
  description,
  user,
  content,
  detailPanel = "",
  statusText = "全局状态：学生可见变更前必须人工审核"
}) {
  return htmlPage({
    title,
    body: `    <div class="admin-workspace" data-admin-shell="desktop">
      <aside class="admin-sidebar" aria-label="管理端左侧导航">
        <a class="brand admin-brand" href="/admin">
          <span class="brand-mark">管理</span>
          <span class="brand-name">${productName}</span>
        </a>
        <nav class="admin-side-nav" aria-label="管理端左侧导航">${renderAdminNav(currentKey)}</nav>
      </aside>
      <div class="admin-surface">
        <header class="admin-topbar" aria-label="管理端全局状态栏">
          <div>
            <p class="eyebrow">${escapeHtml(eyebrow)}</p>
            <h1>${escapeHtml(heading)}</h1>
            <p>${escapeHtml(description)}</p>
          </div>
          <div class="admin-topbar-meta">
            <span>${escapeHtml(statusText)}</span>
            ${user ? `<strong>当前登录：${escapeHtml(user.nickname)}（${escapeHtml(humanizeToken(user.role))}）</strong>` : ""}
          </div>
        </header>
        <main class="admin-content" aria-label="管理端主内容">
          <div class="admin-main-region">${content}</div>
          ${detailPanel}
        </main>
      </div>
    </div>`
  });
}

function renderAdminTable({ caption, headers, rows, emptyText }) {
  if (rows.length === 0) {
    return `<p class="empty-state">${escapeHtml(emptyText)}</p>`;
  }

  return `<div class="admin-table-wrap">
    <table class="admin-table">
      <caption>${escapeHtml(caption)}</caption>
      <thead><tr>${headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody>
    </table>
  </div>`;
}

function renderAdminPanel({ id, title, kicker, sections, actions = "", footer = "" }) {
  return `<aside class="admin-detail-panel" id="${escapeHtml(id)}" aria-label="${escapeHtml(title)}">
    <div class="section-heading">
      <div>
        <p class="eyebrow">详情面板</p>
        <h2>${escapeHtml(title)}</h2>
        ${kicker ? `<p class="section-kicker">${escapeHtml(kicker)}</p>` : ""}
      </div>
    </div>
    ${sections.join("")}
    ${actions ? `<section class="admin-review-section" aria-label="${escapeHtml(title)}操作">
      <h3>操作区</h3>
      ${actions}
    </section>` : ""}
    ${footer}
  </aside>`;
}

function renderAdminPanelSection(title, body, ariaLabel = title) {
  return `<section class="admin-review-section" aria-label="${escapeHtml(ariaLabel)}">
    <h3>${escapeHtml(title)}</h3>
    ${body}
  </section>`;
}

function renderStatusCards({ currentYear, annualGuideCount, annualTimelineCount, annualExperienceCount }) {
  return [
    {
      label: "当前周期",
      value: `${currentYear} 广东`,
      detail: "已发布官方数据"
    },
    {
      label: "已发布简章",
      value: `${annualGuideCount} 所院校`,
      detail: "学生端可见"
    },
    {
      label: "时间线进度",
      value: `${annualTimelineCount} 个节点`,
      detail: "简章发布与截止节点"
    },
    {
      label: "已发布面经",
      value: `${annualExperienceCount} 条面经`,
      detail: "结构化学生参考"
    }
  ]
    .map(
      (item) => `<div class="status-item">
        <span class="status-label">${escapeHtml(item.label)}</span>
        <strong class="status-value">${escapeHtml(item.value)}</strong>
        <span class="status-note">${escapeHtml(item.detail)}</span>
      </div>`
    )
    .join("");
}

function renderGradeCards() {
  return entryPoints
    .map(
      (item) => `<article class="info-card">
        <div class="badge-row"><span class="badge">${escapeHtml(item.badge)}</span></div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.body)}</p>
      </article>`
    )
    .join("");
}

function renderTimelineCards(events) {
  if (events.length === 0) {
    return `<p class="empty-state">暂无已发布时间线日期。</p>`;
  }

  return events
    .map((event) => `<article class="compact-card">
      <div class="item-meta">
        <span>${escapeHtml(schoolNameFor(event))}</span>
        <span>${escapeHtml(formatDate(event.endsAt ?? event.startsAt))}</span>
      </div>
      <h3>${escapeHtml(event.title)}</h3>
    </article>`)
    .join("");
}

function renderGuideCards(guides) {
  if (guides.length === 0) {
    return `<p class="empty-state">暂无已发布招生简章。</p>`;
  }

  return guides
    .map((guide) => `<article class="info-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(guide.admissionYear)}</span>
        <span class="soft-badge">已发布简章</span>
      </div>
      <h3>${escapeHtml(schoolNameFor(guide))}</h3>
      <p>${escapeHtml(guide.summary)}</p>
      <dl class="detail-list">
        <div>
          <dt>报名时间</dt>
          <dd>${escapeHtml(formatDate(guide.applicationStartAt))} 至 ${escapeHtml(formatDate(guide.applicationDeadlineAt))}</dd>
        </div>
        <div>
          <dt>更新于</dt>
          <dd>${escapeHtml(formatDate(guide.updatedAt))}</dd>
        </div>
      </dl>
      <a class="text-link" href="${escapeHtml(guide.officialSourceUrl)}" rel="noopener">官方来源</a>
    </article>`)
    .join("");
}

function renderExperienceCards(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">暂无已发布面经。</p>`;
  }

  return experiences
    .map((experience) => `<article class="info-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(experience.verificationStatus)}</span>
      </div>
      <h3>${escapeHtml(schoolNameFor(experience))}</h3>
      <p>${escapeHtml(experience.summary)}</p>
      <dl class="detail-list">
        <div>
          <dt>考核</dt>
          <dd>${escapeHtml(experience.assessmentTypes.join(", "))}</dd>
        </div>
        <div>
          <dt>有用数</dt>
          <dd>${escapeHtml(experience.usefulCount)}</dd>
        </div>
      </dl>
    </article>`)
    .join("");
}

function selectedAttribute(currentValue, optionValue) {
  return String(currentValue ?? "") === String(optionValue) ? " selected" : "";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))]
    .sort((left, right) => String(left).localeCompare(String(right), "zh-CN"));
}

function renderOption(value, label, currentValue) {
  return `<option value="${escapeHtml(value)}"${selectedAttribute(currentValue, value)}>${escapeHtml(label)}</option>`;
}

function schoolAbbreviation(school) {
  if (school?.abbreviation) {
    return school.abbreviation;
  }

  return String(school?.name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function queryStringFromFilters(filters, allowedKeys) {
  const params = new URLSearchParams();

  for (const key of allowedKeys) {
    const value = filters[key];

    if (value !== undefined && value !== null && String(value).length > 0) {
      params.set(key, String(value));
    }
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function schoolListHref(filters = {}) {
  return `/schools${queryStringFromFilters(filters, [
    "year",
    "keyword",
    "status",
    "applicationStatus",
    "schoolType",
    "sort"
  ])}`;
}

function renderFavoriteSchoolForm(schoolId, returnTo, className = "top-action-form") {
  return `<form class="${escapeHtml(className)}" method="post" action="/favorites" aria-label="Favorite school action">
    <input type="hidden" name="targetType" value="school">
    <input type="hidden" name="targetId" value="${escapeHtml(schoolId)}">
    <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
    <button class="icon-button" type="submit" aria-label="Favorite school">${renderIcon("heart")}</button>
  </form>`;
}

function renderSchoolFilters(filters, allCards) {
  const years = uniqueSorted(allCards.map((card) => card.guide.admissionYear)).sort((left, right) => right - left);
  const applicationStatuses = uniqueSorted(allCards.map((card) => card.guide.applicationStatus));
  const schoolTypes = uniqueSorted(allCards.map((card) => card.school.schoolType));

  const yearOptions = [
    renderOption("", "全部年份", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const statusOptions = [
    renderOption("", "全部简章状态", filters.status ?? ""),
    renderOption("published", "已发布", filters.status),
    renderOption("pending_review", "待发布", filters.status),
    renderOption("archived", "历史参考", filters.status)
  ].join("");
  const applicationStatusOptions = [
    renderOption("", "全部报名状态", filters.applicationStatus ?? ""),
    ...applicationStatuses.map((status) => renderOption(status, humanizeToken(status), filters.applicationStatus))
  ].join("");
  const schoolTypeOptions = [
    renderOption("", "全部院校类型", filters.schoolType ?? ""),
    ...schoolTypes.map((schoolType) => renderOption(schoolType, humanizeToken(schoolType), filters.schoolType))
  ].join("");
  const sortOptions = [
    renderOption("deadline", "报名截止", filters.sort ?? "deadline"),
    renderOption("updated", "更新时间", filters.sort),
    renderOption("name", "院校名称", filters.sort)
  ].join("");

  return `<form class="school-filter-panel" method="get" action="/schools" aria-label="院校筛选" data-school-filter-form="true">
    <label class="filter-field school-search-field">
      <span>院校关键词</span>
      <input type="search" name="keyword" value="${escapeHtml(filters.keyword ?? "")}" placeholder="搜索院校" autocomplete="off">
    </label>
    <div class="school-filter-row" aria-label="可见院校筛选">
      <label class="filter-field">
        <span>年份</span>
        <select name="year">${yearOptions}</select>
      </label>
      <label class="filter-field">
        <span>简章状态</span>
        <select name="status">${statusOptions}</select>
      </label>
      <label class="filter-field">
        <span>报名状态</span>
        <select name="applicationStatus">${applicationStatusOptions}</select>
      </label>
      <label class="filter-field">
        <span>院校类型</span>
        <select name="schoolType">${schoolTypeOptions}</select>
      </label>
      <label class="filter-field">
        <span>排序</span>
        <select name="sort">${sortOptions}</select>
      </label>
    </div>
    <div class="filter-actions">
      <button class="primary-action" type="submit">应用</button>
      <a class="secondary-action" href="/schools" data-school-clear-filters="true">清空</a>
    </div>
  </form>`;
}

function selectedSchoolFilterEntries(filters) {
  const entries = [
    ["年份", filters.year],
    ["关键词", filters.keyword],
    ["简章状态", filters.status && humanizeToken(filters.status)],
    ["报名状态", filters.applicationStatus && humanizeToken(filters.applicationStatus)],
    ["院校类型", filters.schoolType && humanizeToken(filters.schoolType)]
  ];

  return entries.filter(([, value]) => value !== undefined && value !== null && String(value).length > 0);
}

function renderSelectedSchoolFilters(filters) {
  const selected = selectedSchoolFilterEntries(filters);

  if (selected.length === 0) {
    return `<p class="filter-summary">正在展示全部已发布院校简章卡片。</p>`;
  }

  return `<div class="selected-filters" aria-label="已选院校筛选">
    ${selected
      .map(([label, value]) => `<span class="filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`)
      .join("")}
    <a class="text-link" href="/schools" data-school-clear-filters="true">清空筛选</a>
  </div>`;
}

function renderSchoolTimelineNodes(nodes) {
  if (nodes.length === 0) {
    return `<p class="inline-empty">时间线${escapeHtml(pendingSupplementText)}</p>`;
  }

  return `<ul class="school-timeline">${nodes
    .map((node) => `<li>
      <span>${escapeHtml(node.title)}</span>
      <strong>${escapeHtml(formatDate(node.endsAt ?? node.startsAt))}</strong>
    </li>`)
    .join("")}</ul>`;
}

function renderFormulaTag(formula) {
  if (!formula?.available) {
    return "无明确公式";
  }

  const formulaName = String(formula.formulaName ?? "").toLowerCase();

  if (formulaName.includes("60/30/10")) {
    return "631";
  }

  if (formulaName.includes("85/15")) {
    return "85/15";
  }

  if (formula.formulaType === "custom") {
    return "自定义";
  }

  return "自定义";
}

function renderExperienceAvailability(experiences) {
  return `${experiences.count} 条面经`;
}

function renderSchoolEmptyState(filters) {
  const hasFilters = selectedSchoolFilterEntries(filters).length > 0;
  const clearAction = hasFilters
    ? `<a class="secondary-action" href="/schools" data-school-clear-filters="true">清空筛选</a>`
    : "";

  return `<div class="empty-state school-empty-state">
    <strong>没有匹配院校</strong>
    <p>当前筛选没有匹配院校，可以切换年份或状态。</p>
    ${clearAction}
  </div>`;
}

function renderSchoolCards(cards, filters) {
  if (cards.length === 0) {
    return renderSchoolEmptyState(filters);
  }

  const returnTo = schoolListHref(filters);

  return cards
    .map((card) => {
      const detailHref = `/schools/${escapeHtml(encodeURIComponent(card.school.id))}?year=${escapeHtml(card.guide.admissionYear)}`;

      return `<article class="school-card">
        <div class="school-card-top">
          <div class="school-title-group">
            <div class="badge-row">
              <span class="badge">${escapeHtml(card.guide.admissionYear)}</span>
              <span class="soft-badge">${escapeHtml(humanizeToken(card.guide.status))}</span>
              <span class="muted-badge">${escapeHtml(schoolAbbreviation(card.school))}</span>
            </div>
            <h3><a href="${detailHref}">${escapeHtml(card.school.name)}</a></h3>
            <p class="school-abbrev">${escapeHtml(schoolAbbreviation(card.school))} · ${escapeHtml(humanizeToken(card.school.schoolType))}</p>
          </div>
          ${renderFavoriteSchoolForm(card.school.id, returnTo, "school-card-favorite")}
        </div>
        <dl class="school-card-facts">
          <div>
            <dt>截止时间</dt>
            <dd>${escapeHtml(formatDate(card.guide.applicationDeadlineAt))}</dd>
          </div>
          <div>
            <dt>公式</dt>
            <dd>${escapeHtml(renderFormulaTag(card.formula))}</dd>
          </div>
          <div>
            <dt>面经</dt>
            <dd>${escapeHtml(renderExperienceAvailability(card.experiences))}</dd>
          </div>
          <div>
            <dt>报名</dt>
            <dd>${escapeHtml(humanizeToken(card.guide.applicationStatus))}</dd>
          </div>
        </dl>
        <p>${escapeHtml(card.guide.summary)}</p>
        <div class="timeline-block">
          <h4>关键时间线</h4>
          ${renderSchoolTimelineNodes(card.keyTimelineNodes)}
        </div>
        <a class="text-link school-card-link" href="${detailHref}">查看院校详情</a>
      </article>`;
    })
    .join("");
}

function renderTimelineFilters(filters) {
  const selectedSchoolId = filters.schoolIds?.[0] ?? "";
  const years = uniqueSorted(listGuides().map((guide) => guide.admissionYear)).sort((left, right) => right - left);
  const schoolsById = new Map(
    listSchoolGuideCards({ sort: "name" }).map((card) => [card.school.id, card.school])
  );
  const nodeTypeOptions = [
    renderOption("", "全部节点类型", filters.nodeType ?? ""),
    ...timelineEventDefinitions.map((definition) => (
      renderOption(definition.eventKey, definition.title, filters.nodeType)
    ))
  ].join("");
  const yearOptions = [
    renderOption("", "全部年份", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const schoolOptions = [
    renderOption("", "全部院校", selectedSchoolId),
    ...[...schoolsById.values()].map((school) => renderOption(school.id, school.name, selectedSchoolId))
  ].join("");
  const mineInput = filters.mine ? `<input type="hidden" name="mine" value="true">` : "";

  return `<form class="filter-panel timeline-filter-panel" method="get" action="/timeline" aria-label="时间线筛选">
    ${mineInput}
    <label class="filter-field">
      <span>年份</span>
      <select name="year">${yearOptions}</select>
    </label>
    <label class="filter-field">
      <span>节点类型</span>
      <select name="nodeType">${nodeTypeOptions}</select>
    </label>
    <label class="filter-field wide-field">
      <span>院校</span>
      <select name="schoolIds">${schoolOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="secondary-action" type="submit">应用</button>
      <a class="secondary-action" href="${filters.mine ? "/timeline?mine=true" : "/timeline"}">重置</a>
    </div>
  </form>`;
}

function timelineHref(filters, overrides = {}) {
  const next = {
    year: filters.year,
    schoolIds: filters.schoolIds ?? [],
    mine: filters.mine,
    nodeType: filters.nodeType,
    ...overrides
  };
  const params = new URLSearchParams();

  if (next.mine) {
    params.set("mine", "true");
  }

  if (next.year) {
    params.set("year", String(next.year));
  }

  if (next.nodeType) {
    params.set("nodeType", next.nodeType);
  }

  if (next.schoolIds?.length) {
    params.set("schoolIds", next.schoolIds.join(","));
  }

  const query = params.toString();
  return query ? `/timeline?${query}` : "/timeline";
}

function renderTimelineTabs(filters) {
  const allHref = timelineHref(filters, { mine: false });
  const mineHref = timelineHref(filters, { mine: true });
  const allCurrent = filters.mine ? "" : ` aria-current="page"`;
  const mineCurrent = filters.mine ? ` aria-current="page"` : "";

  return `<nav class="timeline-tabs" aria-label="时间线范围">
    <a href="${escapeHtml(allHref)}"${allCurrent}>全部节点</a>
    <a href="${escapeHtml(mineHref)}"${mineCurrent}>我的收藏</a>
  </nav>`;
}

function formatTimelineWindow(node) {
  if (!node.startsAt && !node.endsAt) {
    return "待公布";
  }

  if (node.startsAt && node.endsAt && node.startsAt !== node.endsAt) {
    return `${formatDate(node.startsAt)} 至 ${formatDate(node.endsAt)}`;
  }

  return formatDate(node.endsAt ?? node.startsAt);
}

function timelineDisplayStatus(node) {
  if (!node.isDateKnown) {
    return {
      className: "status-to_be_announced",
      label: "待公布"
    };
  }

  return {
    className: `status-${node.status}`,
    label: humanizeToken(node.status)
  };
}

function timelineMonthLabel(node) {
  const dateValue = node.startsAt ?? node.endsAt;

  if (!dateValue) {
    return "待公布";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "待公布";
  }

  return date.toLocaleString("zh-CN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  });
}

function groupTimelineNodesByMonth(nodes) {
  const groups = [];
  const groupsByLabel = new Map();

  for (const node of nodes) {
    const label = timelineMonthLabel(node);
    const group = groupsByLabel.get(label) ?? { label, nodes: [] };
    group.nodes.push(node);

    if (!groupsByLabel.has(label)) {
      groupsByLabel.set(label, group);
      groups.push(group);
    }
  }

  return groups;
}

function renderTimelineEmptyState(timeline) {
  if (timeline.mine && timeline.favorites.length === 0) {
    return `<div class="timeline-empty-state">
      <strong>收藏院校后生成我的时间线。</strong>
      <p>从院校列表或详情页收藏目标院校，再回到这里查看院校相关时间线。</p>
      <a class="secondary-action" href="/schools">浏览院校</a>
    </div>`;
  }

  if (timeline.mine) {
    return `<p class="empty-state">当前筛选没有匹配的收藏院校时间线节点。</p>`;
  }

  return `<p class="empty-state">当前筛选没有匹配的已发布时间线节点。</p>`;
}

function renderTimelineNodeCards(timeline) {
  if (timeline.events.length === 0) {
    return renderTimelineEmptyState(timeline);
  }

  const reminderEventIds = new Set(timeline.reminders.map((reminder) => reminder.eventId));

  return groupTimelineNodesByMonth(timeline.events)
    .map((group) => `<section class="timeline-month-group" aria-label="${escapeHtml(group.label)}">
      <h3>${escapeHtml(group.label)}</h3>
      <div class="timeline-month-list">${group.nodes
    .map((node) => {
      const reminderBadge = reminderEventIds.has(node.id)
        ? `<span class="site-badge">站内提醒</span>`
        : "";
      const displayStatus = timelineDisplayStatus(node);
      const detailHref = `/schools/${escapeHtml(encodeURIComponent(node.school.id))}?year=${escapeHtml(node.guide.admissionYear)}`;

      return `<article class="timeline-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(node.guide.admissionYear)}</span>
          <span class="status-badge ${escapeHtml(displayStatus.className)}">${escapeHtml(displayStatus.label)}</span>
          ${reminderBadge}
        </div>
        <h4><a href="${detailHref}">${escapeHtml(node.title)}</a></h4>
        <dl class="detail-list split-details">
          <div>
            <dt>院校</dt>
            <dd>${escapeHtml(node.school.name)}</dd>
          </div>
          <div>
            <dt>日期</dt>
            <dd>${escapeHtml(formatTimelineWindow(node))}</dd>
          </div>
          <div>
            <dt>节点类型</dt>
            <dd>${escapeHtml(humanizeToken(node.eventKey))}</dd>
          </div>
          <div>
            <dt>来源简章年份</dt>
            <dd>${escapeHtml(node.guide.admissionYear)}</dd>
          </div>
        </dl>
        <a class="text-link" href="${detailHref}">查看关联院校详情</a>
      </article>`;
    })
    .join("")}</div>
    </section>`)
    .join("");
}

function renderDetailLink(url, label) {
  if (!url) {
    return `<span class="inline-empty">${escapeHtml(missingOfficialText)}</span>`;
  }

  return `<a class="text-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

function renderYearSwitcher(detail) {
  return `<div class="year-switcher" aria-label="Admission year selector">${detail.availableYears
    .map((year) => {
      const className = year === detail.selectedYear ? "year-link active-year" : "year-link";
      const current = year === detail.selectedYear ? ` aria-current="page"` : "";
      return `<a class="${className}" href="/schools/${escapeHtml(encodeURIComponent(detail.school.id))}?year=${escapeHtml(year)}"${current}>${escapeHtml(year)}</a>`;
    })
    .join("")}</div>`;
}

function renderDetailRows(rows) {
  return `<dl class="detail-list split-details">${rows
    .map((row) => `<div>
      <dt>${escapeHtml(row.label)}</dt>
      <dd>${row.html ?? escapeHtml(row.value)}</dd>
    </div>`)
    .join("")}</dl>`;
}

function renderTextList(items) {
  if (!items || items.length === 0) {
    return `<p class="inline-empty">${escapeHtml(missingOfficialText)}</p>`;
  }

  return `<ul class="requirement-list">${items
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("")}</ul>`;
}

function renderMajorList(majors) {
  if (!majors || majors.length === 0) {
    return `<p class="inline-empty">${escapeHtml(pendingSupplementText)}</p>`;
  }

  return `<ul class="requirement-list">${majors
    .map((major) => `<li>
      <strong>${escapeHtml(displayValue(major.name, pendingSupplementText))}</strong>
      <span>${escapeHtml(displayValue(major.track, missingOfficialText))}</span>
    </li>`)
    .join("")}</ul>`;
}

function renderFeeSummary(fees) {
  if (!fees || Object.keys(fees).length === 0) {
    return missingOfficialText;
  }

  const applicationFee = fees.applicationFeeCny ?? missingOfficialText;
  const assessmentFee = fees.assessmentFeeCny ?? missingOfficialText;

  return `报名费：${Number.isFinite(applicationFee) ? `${applicationFee} 元` : applicationFee}；考核费：${Number.isFinite(assessmentFee) ? `${assessmentFee} 元` : assessmentFee}`;
}

function renderContactSummary(contact) {
  if (!contact || Object.keys(contact).length === 0) {
    return missingOfficialText;
  }

  return [
    `电话：${displayValue(contact.phone)}`,
    `邮箱：${displayValue(contact.email)}`
  ].join("；");
}

const detailTimelineOrder = [
  ["application_start", "报名开始"],
  ["application_deadline", "报名截止"],
  ["preliminary_review_result", "初审结果"],
  ["school_assessment", "校测"],
  ["shortlist_publication", "入围名单"]
];

function dateForDetailTimeline(eventKey, guide, nodes) {
  if (eventKey === "application_start") {
    return guide.applicationStartAt;
  }

  if (eventKey === "application_deadline") {
    return guide.applicationDeadlineAt;
  }

  const node = nodes.find((timelineNode) => timelineNode.eventKey === eventKey);
  return node?.endsAt ?? node?.startsAt ?? null;
}

function renderDetailTimelineCard(detail) {
  return `<article class="detail-panel" data-detail-card="key-timeline">
    <div class="section-heading"><h2>关键时间线</h2></div>
    <ul class="detail-timeline">${detailTimelineOrder
      .map(([eventKey, label]) => `<li>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(formatDate(dateForDetailTimeline(eventKey, detail.guide, detail.timeline)))}</strong>
      </li>`)
      .join("")}</ul>
  </article>`;
}

function sourceDateForGuide(guide) {
  return guide.sourcePublishedAt ?? guide.sourceUpdatedAt ?? guide.publishedAt ?? guide.updatedAt;
}

function guideStatusTag(detail) {
  return detail.historicalReference ? "Historical reference" : humanizeToken(detail.guide.status);
}

function renderHistoricalReferenceNotice(detail) {
  if (!detail.historicalReference) {
    return "";
  }

  const requestedYear = detail.requestedYear ?? "当年";
  return `<p class="reference-notice">暂无可见的 ${escapeHtml(requestedYear)} 已发布简章，当前展示 ${escapeHtml(detail.selectedYear)} 年作为历史参考。</p>`;
}

function renderCollapsibleText(value, label, fallback = missingOfficialText) {
  const text = displayValue(value, fallback);

  if (text === fallback) {
    return `<p class="inline-empty">${escapeHtml(text)}</p>`;
  }

  if (text.length <= 72) {
    return `<p>${escapeHtml(text)}</p>`;
  }

  const preview = `${text.slice(0, 72).trim()}...`;

  return `<div class="collapsible-text">
    <p>${escapeHtml(preview)}</p>
    <details>
      <summary>展开${escapeHtml(label)}</summary>
      <p>${escapeHtml(text)}</p>
    </details>
  </div>`;
}

function renderOfficialGuideSummaryCard(detail) {
  const guide = detail.guide;

  return `<article class="detail-panel" data-detail-card="official-guide-summary">
    <div class="section-heading"><h2>官方简章摘要</h2></div>
    ${renderHistoricalReferenceNotice(detail)}
    <h3>${escapeHtml(displayValue(guide.guideTitle, pendingSupplementText))}</h3>
    ${renderCollapsibleText(guide.summary, "official summary", pendingSupplementText)}
    ${renderDetailRows([
      { label: "来源类型", value: humanizeToken(displayValue(guide.sourceType)) },
      { label: "来源日期", value: formatDate(sourceDateForGuide(guide)) },
      { label: "官方简章", html: renderDetailLink(guide.officialSourceUrl, "打开官方简章") },
      { label: "版本", value: `版本 ${guide.version}` }
    ])}
  </article>`;
}

function formulaWeightSummary(formula) {
  return formula.formulaConfig.inputs
    .map((input) => `${input.label} ${Math.round(input.weight * 100)}%`)
    .join(" + ");
}

function renderFormulaDetail(detail) {
  const formula = detail.formula;

  if (!formula) {
    return `<article class="detail-panel" id="formula" data-detail-card="score-formula">
      <div class="section-heading"><h2>综合分公式</h2></div>
      <p class="empty-state">暂无已发布公式，综合分计算等待官方明确。</p>
    </article>`;
  }

  const inputs = formula.formulaConfig.inputs
    .map((input) => `<li>
      <span>${escapeHtml(input.label)}</span>
      <strong>${escapeHtml(Math.round(input.weight * 100))}%</strong>
      <em>满分 ${escapeHtml(input.maxScore)}</em>
    </li>`)
    .join("");
  const calculatorHref = detailCalculatorHref(detail);

  return `<article class="detail-panel" id="formula" data-detail-card="score-formula">
    <div class="section-heading">
      <h2>综合分公式</h2>
      ${renderDetailLink(formula.officialSourceUrl, "公式来源")}
    </div>
    <h3>${escapeHtml(formula.formulaName)}</h3>
    <p>${escapeHtml(formulaWeightSummary(formula))}</p>
    ${renderCollapsibleText(formula.explanation, "公式说明")}
    <ul class="formula-inputs">${inputs}</ul>
    <a class="text-link" href="${escapeHtml(calculatorHref)}">打开综合分计算器</a>
  </article>`;
}

function renderAdmissionRequirementsCard(guide) {
  return `<article class="detail-panel" data-detail-card="admission-requirements">
    <div class="section-heading"><h2>报考要求</h2></div>
    ${renderDetailRows([
      { label: "报名条件", value: missingOfficialText },
      { label: "学考要求", html: renderCollapsibleText(guide.academicTestRequirements, "学考要求") },
      { label: "选科要求", html: renderTextList(guide.subjectRequirements) },
      { label: "招生专业", html: renderMajorList(guide.majors) }
    ])}
  </article>`;
}

function renderAssessmentAdmissionCard(guide) {
  return `<article class="detail-panel" data-detail-card="assessment-admission">
    <div class="section-heading"><h2>考核与录取</h2></div>
    ${renderDetailRows([
      { label: "考核方式", html: renderCollapsibleText(guide.assessmentMethod, "考核方式") },
      { label: "入围规则", value: missingOfficialText },
      { label: "录取规则", html: renderCollapsibleText(guide.admissionRule, "录取规则") },
      { label: "志愿批次", value: missingOfficialText }
    ])}
  </article>`;
}

function renderFeesConsultationCard(guide) {
  return `<article class="detail-panel" data-detail-card="fees-consultation">
    <div class="section-heading"><h2>费用与咨询</h2></div>
    ${renderDetailRows([
      { label: "费用", value: renderFeeSummary(guide.fees) },
      { label: "咨询方式", value: renderContactSummary(guide.contact) }
    ])}
  </article>`;
}

function renderExperienceDetailCards(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">面经${escapeHtml(pendingSupplementText)}</p>`;
  }

  return experiences
    .map((experience) => `<article class="info-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(experience.verificationStatus))}</span>
        <span class="muted-badge">${escapeHtml(schoolNameFor(experience))}</span>
      </div>
      <h3>${escapeHtml(humanizeToken(experience.stage))}</h3>
      <p>${escapeHtml(experience.summary)}</p>
      ${renderDetailRows([
        { label: "考核", value: displayValue(experience.assessmentTypes) },
        { label: "有用数", value: experience.usefulCount }
      ])}
    </article>`)
    .join("");
}

function isApplicationOpen(guide) {
  return guide.applicationStatus === "open";
}

function renderActionAnchor({ href, label, primary = false, external = false }) {
  const className = primary ? "primary-action" : "secondary-action";
  const target = external ? ` target="_blank" rel="noopener"` : "";

  return `<a class="${className}" href="${escapeHtml(href)}"${target}>${escapeHtml(label)}</a>`;
}

function detailCalculatorHref(detail) {
  return `/calculator?schoolId=${encodeURIComponent(detail.school.id)}&year=${detail.selectedYear}`;
}

function detailExperiencesHref(detail) {
  return `/experiences?schoolId=${encodeURIComponent(detail.school.id)}&year=${detail.selectedYear}`;
}

function detailSubmissionHref(detail) {
  return `/experiences/new?schoolId=${encodeURIComponent(detail.school.id)}&year=${detail.selectedYear}`;
}

function experienceListHref(filters = {}) {
  return `/experiences${queryStringFromFilters(filters, [
    "keyword",
    "schoolId",
    "year",
    "stage",
    "assessmentType",
    "verified",
    "sort"
  ])}`;
}

function experienceDetailHref(experience) {
  return `/experiences/${encodeURIComponent(experience.id)}`;
}

function renderFavoriteExperienceForm(experienceId, returnTo, className = "top-action-form") {
  return `<form class="${escapeHtml(className)}" method="post" action="/favorites" aria-label="Favorite experience action">
    <input type="hidden" name="targetType" value="experience">
    <input type="hidden" name="targetId" value="${escapeHtml(experienceId)}">
    <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
    <button class="icon-button" type="submit" aria-label="Favorite experience">${renderIcon("heart")}</button>
  </form>`;
}

function renderSchoolQuickActions(detail) {
  const guide = detail.guide;
  const primaryAction = guide.applicationUrl && isApplicationOpen(guide)
    ? "application"
    : detail.formula
      ? "calculator"
      : "";
  const actions = [
    guide.officialSourceUrl
      ? renderActionAnchor({
          href: guide.officialSourceUrl,
          label: "官方简章",
          external: true
        })
      : `<span class="action-note">${escapeHtml(missingOfficialText)}</span>`
  ];

  if (guide.applicationUrl) {
    actions.push(renderActionAnchor({
      href: guide.applicationUrl,
      label: "报名入口",
      primary: primaryAction === "application",
      external: true
    }));
  }

  if (detail.formula) {
    actions.push(renderActionAnchor({
      href: detailCalculatorHref(detail),
      label: "综合分计算器",
      primary: primaryAction === "calculator"
    }));
  } else {
    actions.push(`<span class="action-note">综合分计算等待官方明确。</span>`);
  }

  actions.push(renderActionAnchor({
    href: detailExperiencesHref(detail),
    label: "面经"
  }));

  return `<div class="actions detail-actions school-quick-actions" aria-label="院校快捷操作">${actions.join("")}</div>`;
}

function renderSchoolBottomActionBar(detail) {
  const actions = [];

  if (detail.guide.applicationUrl) {
    actions.push(renderActionAnchor({
      href: detail.guide.applicationUrl,
      label: "报名",
      external: true
    }));
  }

  if (detail.formula) {
    actions.push(renderActionAnchor({
      href: detailCalculatorHref(detail),
      label: "计算"
    }));
  }

  actions.push(renderActionAnchor({
    href: detailSubmissionHref(detail),
    label: "发布面经"
  }));

  return `<section class="school-bottom-action-bar" aria-label="院校底部操作">${actions.join("")}</section>`;
}

function renderSchoolHeaderCard(detail) {
  const schoolLocation = displayValue(detail.school.city);
  const returnTo = `/schools/${encodeURIComponent(detail.school.id)}?year=${detail.selectedYear}`;

  return `<section class="school-detail-header-card" aria-labelledby="school-detail-title">
    <div class="school-detail-header-copy">
      <div class="badge-row">
        <span class="badge">${escapeHtml(detail.selectedYear)}</span>
        <span class="soft-badge">${escapeHtml(guideStatusTag(detail))}</span>
        <span class="muted-badge">${escapeHtml(schoolAbbreviation(detail.school))}</span>
      </div>
      <h1 id="school-detail-title">${escapeHtml(detail.school.name)}</h1>
      <p>${escapeHtml(schoolLocation)} · ${escapeHtml(humanizeToken(detail.school.schoolType))}</p>
    </div>
    ${renderFavoriteSchoolForm(detail.school.id, returnTo, "school-detail-favorite")}
    ${renderYearSwitcher(detail)}
    ${renderSchoolQuickActions(detail)}
  </section>`;
}

export function renderSchoolDetailPage(detail) {
  return renderStudentPage({
    title: `${detail.school.name} ${detail.selectedYear} | ${productName}`,
    currentKey: "schools",
    topBar: renderStudentTopBar({
      type: "detail",
      title: schoolAbbreviation(detail.school),
      backHref: "/schools",
      backLabel: "返回院校",
      actionHtml: renderFavoriteSchoolAction(
        detail.school.id,
        `/schools/${encodeURIComponent(detail.school.id)}?year=${detail.selectedYear}`
      )
    }),
    content: `
      ${renderSchoolHeaderCard(detail)}
      ${renderSchoolBottomActionBar(detail)}

      <section class="section detail-card-stack" aria-label="院校官方详情">
        ${renderDetailTimelineCard(detail)}
        ${renderOfficialGuideSummaryCard(detail)}
        ${renderFormulaDetail(detail)}
        ${renderAdmissionRequirementsCard(detail.guide)}
        ${renderAssessmentAdmissionCard(detail.guide)}
        ${renderFeesConsultationCard(detail.guide)}
      </section>

      <section class="section" aria-labelledby="featured-experiences-title">
        <div class="section-heading">
          <h2 id="featured-experiences-title">精选面经</h2>
          <p class="section-kicker">已发布的结构化校测参考</p>
          <a class="text-link" href="${escapeHtml(detailExperiencesHref(detail))}">查看全部</a>
        </div>
        <div class="card-grid">${renderExperienceDetailCards(detail.featuredExperiences)}</div>
      </section>`
  });
}

export function renderSchoolListPage(filters = {}) {
  const allCards = listSchoolGuideCards({ sort: "name" });
  const cards = listSchoolGuideCards(filters);

  return renderStudentPage({
    title: `院校 | ${productName}`,
    currentKey: "schools",
    topBar: renderStudentTopBar({
      type: "list",
      title: "院校",
      filterHref: "#school-filters",
      filterLabel: "打开院校筛选"
    }),
    content: `
      <section class="page-heading" aria-labelledby="school-list-title">
        <p class="eyebrow">已发布院校简章</p>
        <h1 id="school-list-title">院校</h1>
        <p class="lead">按院校名称或简称搜索，并快速查看简章状态、截止时间、公式和已发布面经。</p>
      </section>

      <section class="section" id="school-filters" aria-label="院校列表筛选" data-school-filters-container="true">
        ${renderSchoolFilters(filters, allCards)}
        ${renderSelectedSchoolFilters(filters)}
        <div class="school-list-status" role="status" aria-live="polite" hidden data-school-list-status="true"></div>
      </section>

      <section class="section" aria-labelledby="school-results-title" data-school-results-section="true">
        <div class="section-heading">
          <h2 id="school-results-title">${escapeHtml(cards.length)} 所院校</h2>
          <p class="section-kicker">草稿和审核中简章不会对访客展示</p>
        </div>
        <div class="list-loading-skeleton" hidden aria-hidden="true" data-list-skeleton="school">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="school-list" data-school-results="true">${renderSchoolCards(cards, filters)}</div>
      </section>`
  });
}

export function renderTimelinePage(timeline) {
  return renderStudentPage({
    title: `时间线 | ${productName}`,
    currentKey: "",
    topBar: renderStudentTopBar({
      type: "list",
      title: "时间线",
      filterHref: "#timeline-filters",
      filterLabel: "打开时间线筛选"
    }),
    content: `
      <section class="page-heading" aria-labelledby="timeline-title">
        <p class="eyebrow">已发布招生日程</p>
        <h1 id="timeline-title">${timeline.mine ? "我的时间线" : "广东时间线"}</h1>
        <p class="lead">跟踪官方综评简章发布、报名窗口、审核节点、校测、志愿填报和录取结果公布。</p>
        ${renderTimelineTabs(timeline.filters)}
      </section>

      <section class="section" id="timeline-filters" aria-label="时间线筛选">
        ${renderTimelineFilters(timeline.filters)}
      </section>

      <section class="section" aria-labelledby="timeline-results-title">
        <div class="section-heading">
          <h2 id="timeline-results-title">${escapeHtml(timeline.count)} 个时间线节点</h2>
          <p class="section-kicker">${escapeHtml(timeline.reminders.length)} 个站内提醒</p>
        </div>
        <div class="timeline-list">${renderTimelineNodeCards(timeline)}</div>
      </section>`
  });
}

function renderExperienceFilters(filters, allExperiences) {
  const years = uniqueSorted(allExperiences.map((experience) => experience.admissionYear))
    .sort((left, right) => right - left);
  const stages = uniqueSorted(allExperiences.map((experience) => experience.stage));
  const assessmentTypes = uniqueSorted(allExperiences.flatMap((experience) => experience.assessmentTypes));
  const schoolsById = new Map(
    listSchoolGuideCards({ sort: "name" }).map((card) => [card.school.id, card.school])
  );
  const yearOptions = [
    renderOption("", "全部年份", filters.year ?? ""),
    ...years.map((year) => renderOption(year, year, filters.year))
  ].join("");
  const schoolOptions = [
    renderOption("", "全部院校", filters.schoolId ?? ""),
    ...[...schoolsById.values()].map((school) => renderOption(school.id, school.name, filters.schoolId))
  ].join("");
  const stageOptions = [
    renderOption("", "全部阶段", filters.stage ?? ""),
    ...stages.map((stage) => renderOption(stage, humanizeToken(stage), filters.stage))
  ].join("");
  const assessmentOptions = [
    renderOption("", "全部考核形式", filters.assessmentType ?? ""),
    ...assessmentTypes.map((type) => renderOption(type, humanizeToken(type), filters.assessmentType))
  ].join("");
  const verifiedOptions = [
    renderOption("", "全部认证状态", filters.verified ?? ""),
    renderOption("true", "已认证", filters.verified === true ? "true" : ""),
    renderOption("false", "认证待审核", filters.verified === false ? "false" : "")
  ].join("");
  const sortOptions = [
    renderOption("default", "近两年优先", filters.sort ?? "default"),
    renderOption("newest", "最新", filters.sort),
    renderOption("useful", "有用数", filters.sort),
    renderOption("verified", "已认证优先", filters.sort)
  ].join("");

  return `<form class="filter-panel experience-filter-panel" method="get" action="/experiences" aria-label="面经筛选">
    <label class="filter-field wide-field experience-search-field">
      <span>面经关键词</span>
      <input type="search" name="keyword" value="${escapeHtml(filters.keyword ?? "")}" placeholder="搜索院校、阶段或关键词" autocomplete="off">
    </label>
    <label class="filter-field wide-field">
      <span>院校</span>
      <select name="schoolId">${schoolOptions}</select>
    </label>
    <label class="filter-field">
      <span>年份</span>
      <select name="year">${yearOptions}</select>
    </label>
    <label class="filter-field">
      <span>阶段</span>
      <select name="stage">${stageOptions}</select>
    </label>
    <label class="filter-field">
      <span>考核形式</span>
      <select name="assessmentType">${assessmentOptions}</select>
    </label>
    <label class="filter-field">
      <span>认证状态</span>
      <select name="verified">${verifiedOptions}</select>
    </label>
    <label class="filter-field">
      <span>排序</span>
      <select name="sort">${sortOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="secondary-action" type="submit">应用</button>
      <a class="secondary-action" href="/experiences">清空</a>
    </div>
  </form>`;
}

function selectedExperienceFilterEntries(filters) {
  const entries = [
    ["关键词", filters.keyword],
    ["院校", filters.schoolId && (getSchoolById(filters.schoolId)?.name ?? filters.schoolId)],
    ["年份", filters.year],
    ["阶段", filters.stage && humanizeToken(filters.stage)],
    ["考核形式", filters.assessmentType && humanizeToken(filters.assessmentType)],
    ["认证状态", typeof filters.verified === "boolean"
      ? filters.verified ? "已认证" : "认证待审核"
      : null],
    ["排序", filters.sort && filters.sort !== "default" ? humanizeToken(filters.sort) : null]
  ];

  return entries.filter(([, value]) => value !== undefined && value !== null && String(value).length > 0);
}

function renderSelectedExperienceFilters(filters) {
  const selected = selectedExperienceFilterEntries(filters);

  if (selected.length === 0) {
    return `<p class="filter-summary">优先展示近年已发布面经，再按认证状态和更新时间排序。</p>`;
  }

  return `<div class="selected-filters" aria-label="已选面经筛选">
    ${selected
      .map(([label, value]) => `<span class="filter-chip">${escapeHtml(label)}: ${escapeHtml(value)}</span>`)
      .join("")}
    <a class="text-link" href="/experiences">清空筛选</a>
  </div>`;
}

function latestExperienceReferenceYear() {
  return currentAdmissionYear(listGuides());
}

function experienceVerifiedLabel(experience) {
  return experience.verificationStatus === "verified" ? "已认证面经" : "认证待审核";
}

function experienceHistoricalReferenceNotice(experience) {
  if (latestExperienceReferenceYear() - experience.admissionYear < 2) {
    return "";
  }

  return `历史参考：${experience.admissionYear} 年面经可能不反映当前校测规则。`;
}

function renderExperienceReferenceNotice(experience) {
  const notice = experienceHistoricalReferenceNotice(experience);

  return notice ? `<p class="reference-notice">${escapeHtml(notice)}</p>` : "";
}

function renderExperienceEmptyState(filters) {
  const hasFilters = selectedExperienceFilterEntries(filters).length > 0;
  const clearAction = hasFilters
    ? `<a class="secondary-action" href="/experiences">清空筛选</a>`
    : "";

  return `<div class="empty-state experience-empty-state">
    <strong>没有匹配的已发布面经</strong>
    <p>可以调整筛选，或发布该院校、年份、考核形式的第一条相关面经。</p>
    <div class="actions">
      ${clearAction}
      <a class="primary-action" href="/experiences/new">发布面经</a>
    </div>
  </div>`;
}

function renderExperienceListCards(experiences, filters = {}) {
  if (experiences.length === 0) {
    return renderExperienceEmptyState(filters);
  }

  const returnTo = experienceListHref(filters);

  return experiences
    .map((experience) => {
      const school = getSchoolById(experience.schoolId);
      const detailHref = experienceDetailHref(experience);

      return `<article class="experience-card">
        <div class="experience-card-top">
          <div class="experience-title-group">
            <div class="badge-row">
              <span class="badge">${escapeHtml(experience.admissionYear)}</span>
              <span class="soft-badge">${escapeHtml(experienceVerifiedLabel(experience))}</span>
              <span class="muted-badge">${escapeHtml(humanizeToken(experience.stage))}</span>
            </div>
            <h3><a href="${escapeHtml(detailHref)}">${escapeHtml(school?.name ?? "已发布院校")}</a></h3>
            <p class="experience-major">${escapeHtml(displayValue(experience.majorGroup, "招生组别未明确"))}</p>
          </div>
          ${renderFavoriteExperienceForm(experience.id, returnTo, "experience-card-favorite")}
        </div>
        <p>${escapeHtml(experience.summary)}</p>
        <dl class="detail-list split-details">
          <div>
            <dt>院校</dt>
            <dd>${escapeHtml(school?.name ?? "已发布院校")}</dd>
          </div>
          <div>
            <dt>年份</dt>
            <dd>${escapeHtml(experience.admissionYear)}</dd>
          </div>
          <div>
            <dt>专业或组别</dt>
            <dd>${escapeHtml(displayValue(experience.majorGroup, missingOfficialText))}</dd>
          </div>
          <div>
            <dt>阶段</dt>
            <dd>${escapeHtml(humanizeToken(experience.stage))}</dd>
          </div>
          <div>
            <dt>考核形式</dt>
            <dd>${escapeHtml(experience.assessmentTypes.map(humanizeToken).join("、"))}</dd>
          </div>
          <div>
            <dt>有用数</dt>
            <dd>${escapeHtml(experience.usefulCount)}</dd>
          </div>
        </dl>
        ${renderExperienceReferenceNotice(experience)}
        <a class="text-link" href="${escapeHtml(detailHref)}">阅读结构化详情</a>
      </article>`;
    })
    .join("");
}

function booleanResultLabel(value, positive, negative) {
  if (value === true) {
    return positive;
  }

  if (value === false) {
    return negative;
  }

  return "未披露";
}

function renderRatingPills(experience) {
  const ratings = [
    ["难度", experience.difficultyScore],
    ["压力", experience.pressureScore],
    ["区分度", experience.differentiationScore]
  ];

  return `<div class="rating-grid" aria-label="面经评分">${ratings
    .map(([label, value]) => `<div class="rating-pill">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}/5</strong>
    </div>`)
    .join("")}</div>`;
}

function renderExperienceActionBar(experience) {
  const returnTo = experienceDetailHref(experience);

  return `<section class="experience-action-bar" aria-label="面经操作">
    ${renderFavoriteExperienceForm(experience.id, returnTo, "experience-detail-favorite")}
    <form class="experience-action-form" method="post" action="/experiences/${escapeHtml(encodeURIComponent(experience.id))}/useful" aria-label="标记面经有用">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
      <button class="secondary-action" type="submit">有用（${escapeHtml(experience.usefulCount)}）</button>
    </form>
    <details class="report-details">
      <summary>举报</summary>
      <form class="report-form" method="post" action="/reports" aria-label="举报面经">
        <input type="hidden" name="targetType" value="experience">
        <input type="hidden" name="targetId" value="${escapeHtml(experience.id)}">
        <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
        <label class="form-field">
          <span>举报原因</span>
          <select name="reason" required>
            <option value="">选择原因</option>
            <option value="privacy concern">隐私风险</option>
            <option value="unverified original question">疑似未核验原题</option>
            <option value="external traffic or paid service">外部导流或付费服务</option>
            <option value="other content issue">其他内容问题</option>
          </select>
        </label>
        <label class="form-field">
          <span>说明</span>
          <textarea name="description" rows="3" maxlength="2000"></textarea>
        </label>
        <button class="secondary-action" type="submit">提交举报</button>
      </form>
    </details>
  </section>`;
}

function renderExperienceHeader(experience) {
  const school = getSchoolById(experience.schoolId);

  return `<section class="experience-detail-header-card" aria-labelledby="experience-detail-title">
    <div class="badge-row">
      <span class="badge">${escapeHtml(experience.admissionYear)}</span>
      <span class="soft-badge">${escapeHtml(experienceVerifiedLabel(experience))}</span>
      <span class="muted-badge">${escapeHtml(humanizeToken(experience.stage))}</span>
    </div>
    <h1 id="experience-detail-title">${escapeHtml(school?.name ?? "已发布院校")}</h1>
    <p>${escapeHtml(displayValue(experience.majorGroup, "招生组别未明确"))} · ${escapeHtml(experience.assessmentTypes.map(humanizeToken).join("、"))}</p>
    ${renderExperienceReferenceNotice(experience)}
    ${renderDetailRows([
      { label: "院校", value: school?.name ?? "已发布院校" },
      { label: "年份", value: experience.admissionYear },
      { label: "阶段", value: humanizeToken(experience.stage) },
      { label: "有用数", value: experience.usefulCount }
    ])}
  </section>`;
}

function renderQuestionTypeCategories(experience) {
  if (!experience.questionTypes?.length) {
    return `<p class="inline-empty">${escapeHtml(missingOfficialText)}</p>`;
  }

  return `<div class="question-type-grid">${experience.questionTypes
    .map((questionType) => `<span class="question-type-pill">${escapeHtml(humanizeToken(questionType))}</span>`)
    .join("")}</div>`;
}

export function renderExperienceDetailPage(experience) {
  const school = getSchoolById(experience.schoolId);
  const detailHref = experienceDetailHref(experience);

  return renderStudentPage({
    title: `${school?.name ?? "面经"} ${experience.admissionYear} | ${productName}`,
    currentKey: "experiences",
    topBar: renderStudentTopBar({
      type: "detail",
      title: "面经",
      backHref: "/experiences",
      backLabel: "返回面经",
      actionHtml: renderFavoriteExperienceForm(experience.id, detailHref)
    }),
    content: `
      ${renderExperienceHeader(experience)}
      ${renderExperienceActionBar(experience)}

      <section class="section detail-card-stack" aria-label="面经详情">
        <article class="detail-panel" data-experience-detail-section="basic-information">
          <div class="section-heading"><h2>基本信息</h2></div>
          ${renderDetailRows([
            { label: "专业或招生组", value: displayValue(experience.majorGroup) },
            { label: "考生科类", value: humanizeToken(displayValue(experience.candidateTrack)) },
            { label: "入围结果", value: booleanResultLabel(experience.shortlistedStatus, "已入围", "未入围") },
            { label: "录取结果", value: booleanResultLabel(experience.admittedStatus, "已录取", "未录取") },
            { label: "考核形式", value: experience.assessmentTypes.map(humanizeToken).join("、") },
            { label: "地点", value: displayValue(experience.location) }
          ])}
        </article>

        <article class="detail-panel" data-experience-detail-section="process">
          <div class="section-heading"><h2>流程</h2></div>
          ${renderCollapsibleText(experience.processSummary, "流程", pendingSupplementText)}
        </article>

        <article class="detail-panel" data-experience-detail-section="question-types">
          <div class="section-heading"><h2>题型类别</h2></div>
          ${renderQuestionTypeCategories(experience)}
        </article>

        <article class="detail-panel" data-experience-detail-section="preparation-advice">
          <div class="section-heading"><h2>准备与建议</h2></div>
          ${renderDetailRows([
            { label: "准备", html: renderCollapsibleText(experience.preparationSummary, "准备", pendingSupplementText) },
            { label: "建议", html: renderCollapsibleText(experience.advice, "建议", pendingSupplementText) }
          ])}
        </article>

        <article class="detail-panel" data-experience-detail-section="ratings">
          <div class="section-heading"><h2>面经评分</h2></div>
          ${renderRatingPills(experience)}
        </article>
      </section>`
  });
}

const assessmentTypeSubmissionOptions = [
  ["structured_interview", "结构化面试"],
  ["group_discussion", "小组讨论"],
  ["machine_test", "机试"],
  ["materials_review", "材料审核"],
  ["practical_task", "实践任务"]
];

const questionTypeSubmissionOptions = [
  ["motivation", "报考动机"],
  ["current_affairs", "时事议题"],
  ["major_interest", "专业兴趣"],
  ["experiment_design", "实验设计"],
  ["project_reflection", "项目复盘"],
  ["math_reasoning", "数学推理"],
  ["teamwork", "团队协作"],
  ["learning_plan", "学习计划"]
];

function scalarFormValue(formData, name, fallback = "") {
  if (!formData || typeof formData !== "object") {
    return fallback;
  }

  const value = formData[name];

  if (Array.isArray(value)) {
    const found = value.find((item) => String(item ?? "").length > 0);
    return found === undefined ? fallback : String(found);
  }

  if (value === undefined || value === null) {
    return fallback;
  }

  return String(value);
}

function arrayFormValue(formData, name, fallback = []) {
  if (!formData || typeof formData !== "object") {
    return fallback;
  }

  const value = formData[name];

  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (value === undefined || value === null || String(value).length === 0) {
    return fallback;
  }

  return [String(value)];
}

function checkedAttribute(values, optionValue) {
  return values.includes(optionValue) ? " checked" : "";
}

function renderCheckboxOptions(name, options, defaults = []) {
  return options
    .map(([value, label]) => `<label class="checkbox-field">
      <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(value)}"${checkedAttribute(defaults, value)}>
      <span>${escapeHtml(label)}</span>
    </label>`)
    .join("");
}

function submissionSchoolOptions(currentValue = "") {
  const schoolsById = new Map(
    listSchoolGuideCards({ sort: "name" }).map((card) => [card.school.id, card.school])
  );

  return [
    renderOption("", "选择院校", currentValue),
    ...[...schoolsById.values()].map((school) => renderOption(school.id, school.name, currentValue))
  ].join("");
}

function submissionYearOptions(currentValue = "") {
  const years = uniqueSorted(listGuides().map((guide) => guide.admissionYear))
    .sort((left, right) => right - left);

  return [
    renderOption("", "选择年份", currentValue),
    ...years.map((year) => renderOption(year, year, currentValue))
  ].join("");
}

function ratingOptions(currentValue = "") {
  return [
    renderOption("", "选择分值", currentValue),
    ...[1, 2, 3, 4, 5].map((score) => renderOption(score, String(score), currentValue))
  ].join("");
}

function requiredMarker() {
  return `<span class="required-marker" aria-label="必填">*</span>`;
}

function characterHint(name, maxLength) {
  return `<span class="char-hint" data-char-count-for="${escapeHtml(name)}">0/${escapeHtml(maxLength)}</span>`;
}

function renderSubmissionStatus(submission) {
  if (!submission) {
    return "";
  }

  const school = getSchoolById(submission.schoolId);

  return `<section class="submission-status" aria-labelledby="submission-status-title">
    <div class="section-heading">
      <h2 id="submission-status-title">待审核</h2>
      <p class="section-kicker">${escapeHtml(submission.verification.materialCount)} 条认证材料元数据</p>
    </div>
    <dl class="detail-list split-details">
      <div>
        <dt>院校</dt>
        <dd>${escapeHtml(school?.name ?? "已发布院校")}</dd>
      </div>
      <div>
        <dt>年份</dt>
        <dd>${escapeHtml(submission.year)}</dd>
      </div>
      <div>
        <dt>阶段</dt>
        <dd>${escapeHtml(humanizeToken(submission.stage))}</dd>
      </div>
      <div>
        <dt>展示身份</dt>
        <dd>${escapeHtml(submission.author.displayName ?? submission.author.nickname)}</dd>
      </div>
    </dl>
  </section>`;
}

function renderSubmissionError(error) {
  return error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : "";
}

export function renderExperienceSubmissionPage({ user, submission = null, error = "", formData = {} }) {
  const anonymousDefault = scalarFormValue(formData, "isAnonymous", user.defaultAnonymous ? "true" : "false");
  const anonymousOptions = [
    renderOption("true", "Anonymous display", anonymousDefault),
    renderOption("false", "Show nickname", anonymousDefault)
  ].join("");
  const selectedAssessmentTypes = arrayFormValue(formData, "assessmentTypes", ["structured_interview"]);
  const selectedQuestionTypes = arrayFormValue(formData, "questionTypes", ["motivation"]);
  const submissionComplete = submission ? "true" : "false";

  return renderStudentPage({
    title: `发布面经 | ${productName}`,
    currentKey: "experiences",
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "form",
      title: "提交",
      backHref: "/experiences",
      backLabel: "返回面经",
      submitState: "提交后审核"
    }),
    content: `
      <section class="page-heading" aria-labelledby="experience-submit-title">
        <p class="eyebrow">结构化投稿</p>
        <h1 id="experience-submit-title">发布面经</h1>
        <p class="lead">记录校测过程、准备经验和可选认证材料元数据，提交审核后再公开。</p>
      </section>

      ${renderSubmissionStatus(submission)}

      <div class="draft-restore-prompt" hidden data-experience-draft-prompt="true">
        <p>发现本设备保存的草稿。</p>
        <div class="actions">
          <button class="secondary-action" type="button" data-experience-draft-restore="true">恢复草稿</button>
          <button class="secondary-action" type="button" data-experience-draft-clear="true">清除草稿</button>
        </div>
      </div>

      <form class="submission-form" method="post" action="/experiences" aria-label="面经投稿表单" data-experience-submission-form="true" data-submission-complete="${submissionComplete}">
        ${renderSubmissionError(error)}
        <fieldset class="form-section">
          <legend>院校与结果</legend>
          <label class="form-field wide-field">
            <span>院校 ${requiredMarker()}</span>
            <select name="schoolId" required>${submissionSchoolOptions(scalarFormValue(formData, "schoolId"))}</select>
          </label>
          <label class="form-field">
            <span>年份 ${requiredMarker()}</span>
            <select name="year" required>${submissionYearOptions(scalarFormValue(formData, "year"))}</select>
          </label>
          <label class="form-field">
            <span>专业组 ${requiredMarker()}</span>
            <input name="majorGroup" value="${escapeHtml(scalarFormValue(formData, "majorGroup"))}" autocomplete="off" maxlength="160" required>
          </label>
          <label class="form-field">
            <span>考生科类 ${requiredMarker()}</span>
            <select name="candidateTrack" required>
              ${renderOption("", "选择科类", scalarFormValue(formData, "candidateTrack"))}
              ${renderOption("physics", "物理类", scalarFormValue(formData, "candidateTrack"))}
              ${renderOption("history", "历史类", scalarFormValue(formData, "candidateTrack"))}
              ${renderOption("general", "通用", scalarFormValue(formData, "candidateTrack"))}
            </select>
          </label>
          <label class="form-field">
            <span>阶段 ${requiredMarker()}</span>
            <select name="stage" required>
              ${renderOption("", "选择阶段", scalarFormValue(formData, "stage"))}
              ${renderOption("preliminary_review", "初审", scalarFormValue(formData, "stage"))}
              ${renderOption("school_assessment", "校测", scalarFormValue(formData, "stage"))}
              ${renderOption("admission_result", "录取结果", scalarFormValue(formData, "stage"))}
            </select>
          </label>
          <label class="form-field">
            <span>入围状态 ${requiredMarker()}</span>
            <select name="shortlistedStatus" required>
              ${renderOption("", "选择状态", scalarFormValue(formData, "shortlistedStatus"))}
              ${renderOption("true", "已入围", scalarFormValue(formData, "shortlistedStatus"))}
              ${renderOption("false", "未入围", scalarFormValue(formData, "shortlistedStatus"))}
            </select>
          </label>
          <label class="form-field">
            <span>录取状态</span>
            <select name="admittedStatus">
              ${renderOption("", "未披露", scalarFormValue(formData, "admittedStatus"))}
              ${renderOption("true", "已录取", scalarFormValue(formData, "admittedStatus"))}
              ${renderOption("false", "未录取", scalarFormValue(formData, "admittedStatus"))}
            </select>
          </label>
          <label class="form-field wide-field">
            <span>地点</span>
            <input name="location" value="${escapeHtml(scalarFormValue(formData, "location"))}" autocomplete="off" maxlength="240">
          </label>
        </fieldset>

        <fieldset class="form-section">
          <legend>考核详情</legend>
          <div class="form-field wide-field">
            <span>考核类型 ${requiredMarker()}</span>
            <div class="choice-grid">${renderCheckboxOptions("assessmentTypes", assessmentTypeSubmissionOptions, selectedAssessmentTypes)}</div>
          </div>
          <label class="form-field full-field">
            <span>流程 ${requiredMarker()}</span>
            <textarea name="processSummary" rows="5" maxlength="5000" data-character-count="true" required>${escapeHtml(scalarFormValue(formData, "processSummary"))}</textarea>
            ${characterHint("processSummary", 5000)}
          </label>
          <div class="form-field full-field">
            <span>问题类型 ${requiredMarker()}</span>
            <div class="choice-grid">${renderCheckboxOptions("questionTypes", questionTypeSubmissionOptions, selectedQuestionTypes)}</div>
          </div>
          <label class="form-field full-field">
            <span>准备 ${requiredMarker()}</span>
            <textarea name="preparationSummary" rows="4" maxlength="3000" data-character-count="true" required>${escapeHtml(scalarFormValue(formData, "preparationSummary"))}</textarea>
            ${characterHint("preparationSummary", 3000)}
          </label>
        </fieldset>

        <fieldset class="form-section">
          <legend>评分与建议</legend>
          <label class="form-field">
            <span>难度评分 ${requiredMarker()}</span>
            <select name="difficultyScore" required>${ratingOptions(scalarFormValue(formData, "difficultyScore"))}</select>
          </label>
          <label class="form-field">
            <span>压力评分 ${requiredMarker()}</span>
            <select name="pressureScore" required>${ratingOptions(scalarFormValue(formData, "pressureScore"))}</select>
          </label>
          <label class="form-field">
            <span>区分度评分 ${requiredMarker()}</span>
            <select name="differentiationScore" required>${ratingOptions(scalarFormValue(formData, "differentiationScore"))}</select>
          </label>
          <label class="form-field">
            <span>匿名偏好 ${requiredMarker()}</span>
            <select name="isAnonymous" required>${anonymousOptions}</select>
          </label>
          <label class="form-field full-field">
            <span>建议 ${requiredMarker()}</span>
            <textarea name="advice" rows="4" maxlength="3000" data-character-count="true" required>${escapeHtml(scalarFormValue(formData, "advice"))}</textarea>
            ${characterHint("advice", 3000)}
          </label>
        </fieldset>

        <fieldset class="form-section">
          <legend>认证材料元数据</legend>
          <p class="form-help">认证材料元数据用于帮助审核员核验真实性，仅审核端可见，不会展示在学生端。</p>
          <label class="form-field">
            <span>材料类型</span>
            <input name="verificationMaterialType" value="${escapeHtml(scalarFormValue(formData, "verificationMaterialType"))}" autocomplete="off" maxlength="80">
          </label>
          <label class="form-field">
            <span>存储键</span>
            <input name="verificationObjectStorageKey" value="${escapeHtml(scalarFormValue(formData, "verificationObjectStorageKey"))}" autocomplete="off" maxlength="240">
          </label>
          <label class="form-field">
            <span>材料标题</span>
            <input name="verificationTitle" value="${escapeHtml(scalarFormValue(formData, "verificationTitle"))}" autocomplete="off" maxlength="160">
          </label>
          <label class="form-field">
            <span>来源账号</span>
            <input name="verificationSourceAccount" value="${escapeHtml(scalarFormValue(formData, "verificationSourceAccount"))}" autocomplete="off" maxlength="160">
          </label>
          <label class="form-field full-field">
            <span>认证备注</span>
            <textarea name="verificationNotes" rows="3" maxlength="1000" data-character-count="true">${escapeHtml(scalarFormValue(formData, "verificationNotes"))}</textarea>
            ${characterHint("verificationNotes", 1000)}
          </label>
        </fieldset>

        <div class="form-actions">
          <button class="primary-action" type="submit">提交</button>
          <button class="secondary-action" type="button" data-experience-draft-clear="true">清除草稿</button>
          <a class="secondary-action" href="/experiences">取消</a>
        </div>
      </form>
`
  });
}

export function renderExperienceListPage(filters = {}) {
  const allExperiences = listExperiences();
  const experiences = listExperiences(filters);

  return renderStudentPage({
    title: `面经 | ${productName}`,
    currentKey: "experiences",
    topBar: renderStudentTopBar({
      type: "list",
      title: "面经",
      filterHref: "#experience-filters",
      filterLabel: "打开面经筛选"
    }),
    content: `
      <section class="page-heading" aria-labelledby="experience-list-title">
        <p class="eyebrow">已发布校测面经</p>
        <h1 id="experience-list-title">面经列表</h1>
        <p class="lead">按院校、阶段和考核关键词搜索，并查看隐私安全的结构化参考。</p>
        <div class="actions">
          <a class="primary-action" href="/experiences/new">发布面经</a>
        </div>
      </section>

      <section class="section" id="experience-filters" aria-label="面经筛选">
        ${renderExperienceFilters(filters, allExperiences)}
        ${renderSelectedExperienceFilters(filters)}
      </section>

      <section class="section" aria-labelledby="experience-results-title">
        <div class="section-heading">
          <h2 id="experience-results-title">${escapeHtml(experiences.length)} 条已发布面经</h2>
          <p class="section-kicker">审核中投稿不会对访客展示</p>
        </div>
        <div class="experience-list">${renderExperienceListCards(experiences, filters)}</div>
      </section>`
  });
}

function calculatorSchoolEntries(cards) {
  const entriesById = new Map();

  for (const card of cards) {
    const existingEntry = entriesById.get(card.school.id);
    const entry = existingEntry ?? {
      school: card.school,
      years: []
    };

    if (!entry.years.includes(card.guide.admissionYear)) {
      entry.years.push(card.guide.admissionYear);
    }

    entriesById.set(card.school.id, entry);
  }

  return [...entriesById.values()]
    .map((entry) => ({
      ...entry,
      years: entry.years.sort((left, right) => right - left)
    }))
    .sort((left, right) => compareSchoolNames(left.school, right.school));
}

function latestFormulaCard(cards) {
  return [...cards]
    .sort((left, right) => {
      if (right.guide.admissionYear !== left.guide.admissionYear) {
        return right.guide.admissionYear - left.guide.admissionYear;
      }

      return String(right.guide.updatedAt ?? "").localeCompare(String(left.guide.updatedAt ?? ""));
    })
    .find((card) => card.formula.available) ?? cards[0] ?? null;
}

function resolveCalculatorSelection(filters, entries, cards) {
  const fallbackCard = latestFormulaCard(cards);
  const requestedEntry = entries.find((entry) => entry.school.id === filters.schoolId);
  const fallbackEntry = entries.find((entry) => entry.school.id === fallbackCard?.school.id) ?? entries[0] ?? null;
  const selectedEntry = requestedEntry ?? fallbackEntry;
  const selectedYear = selectedEntry?.years.includes(filters.year)
    ? filters.year
    : selectedEntry?.years[0];

  return {
    schoolId: selectedEntry?.school.id,
    year: selectedYear
  };
}

function compareSchoolNames(left, right) {
  return left.name.localeCompare(right.name, "zh-CN");
}

function calculatorOptionsJson(entries) {
  return safeScriptJson({
    schools: entries.map((entry) => ({
      id: entry.school.id,
      name: entry.school.name,
      years: entry.years
    }))
  });
}

function percentageLabel(value) {
  const percentage = value * 100;
  const rounded = Math.round(percentage * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function renderCalculatorSelectionForm(entries, selectedSchoolId, selectedYear) {
  if (entries.length === 0) {
    return `<p class="empty-state">暂无可用于综合分计算的已发布院校简章数据。</p>`;
  }

  const selectedEntry = entries.find((entry) => entry.school.id === selectedSchoolId) ?? entries[0];
  const schoolOptions = entries
    .map((entry) => renderOption(entry.school.id, entry.school.name, selectedSchoolId))
    .join("");
  const yearOptions = selectedEntry.years
    .map((year) => renderOption(year, year, selectedYear))
    .join("");

  return `<form class="filter-panel calculator-selector" method="get" action="/calculator" aria-label="综合分计算器选择">
    <label class="filter-field wide-field">
      <span>院校</span>
      <select name="schoolId" id="calculator-school">${schoolOptions}</select>
    </label>
    <label class="filter-field">
      <span>年份</span>
      <select name="year" id="calculator-year">${yearOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">加载公式</button>
      <a class="secondary-action" href="/calculator">重置</a>
    </div>
  </form>`;
}

function renderCalculatorInput(input) {
  const inputId = `score-${input.key}`;

  return `<label class="score-field" for="${escapeHtml(inputId)}">
    <span>${escapeHtml(input.label)}</span>
    <input
      id="${escapeHtml(inputId)}"
      name="scores[${escapeHtml(input.key)}]"
      type="number"
      inputmode="decimal"
      min="0"
      max="${escapeHtml(input.maxScore)}"
      step="0.01"
      required
      data-score-key="${escapeHtml(input.key)}"
      data-score-label="${escapeHtml(input.label)}"
      data-max-score="${escapeHtml(input.maxScore)}"
      data-weight="${escapeHtml(input.weight)}"
      aria-describedby="${escapeHtml(inputId)}-hint ${escapeHtml(inputId)}-error">
    <small id="${escapeHtml(inputId)}-hint">0 至 ${escapeHtml(input.maxScore)} - ${escapeHtml(percentageLabel(input.weight))}</small>
    <small class="score-error" id="${escapeHtml(inputId)}-error" data-score-error-for="${escapeHtml(input.key)}" aria-live="polite"></small>
  </label>`;
}

function renderFormulaWeightNotes(formula) {
  const inputs = formula.formulaConfig.inputs
    .map((input) => `${input.label}：权重 ${percentageLabel(input.weight)}，满分 ${input.maxScore}`)
    .join("；");

  return `权重与满分：${inputs}。输出分值：${formula.formulaConfig.outputMaxScore}。`;
}

function renderCalculatorFormulaForm(detail) {
  if (!detail) {
    return `<div class="calculator-unavailable">
      <h3>未选择已发布简章</h3>
      <p>需要先选择已发布院校简章和年份，才会显示计算表单。</p>
    </div>`;
  }

  if (!detail.formula || !detail.formula.officialSourceUrl) {
    const title = detail.formula ? "缺少官方来源公式" : "暂无明确已发布公式";
    const copy = detail.formula
      ? "该已发布公式暂缺官方来源依据，计算表单已隐藏。"
      : `${detail.school.name} ${detail.selectedYear} 年暂无明确已发布综合分公式，计算表单已隐藏。`;

    return `<div class="calculator-unavailable" id="score-input-unavailable">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(copy)}</p>
      ${renderDetailLink(detail.guide.officialSourceUrl, "已发布简章")}
    </div>`;
  }

  const inputs = detail.formula.formulaConfig.inputs.map(renderCalculatorInput).join("");

  return `<form class="score-entry-form" id="score-input-form" novalidate data-school-id="${escapeHtml(detail.school.id)}" data-year="${escapeHtml(detail.selectedYear)}">
    <div class="formula-summary">
      <div>
        <span class="soft-badge">有官方来源的公式</span>
        <h3>${escapeHtml(detail.formula.formulaName)}</h3>
        <p>${escapeHtml(detail.formula.explanation)}</p>
        <p>${escapeHtml(renderFormulaWeightNotes(detail.formula))}</p>
      </div>
      <a class="text-link" href="${escapeHtml(detail.formula.officialSourceUrl)}" target="_blank" rel="noopener">官方来源依据</a>
    </div>
    <div class="score-fields">${inputs}</div>
    <div class="calculator-feedback" id="calculator-feedback" role="alert" aria-live="polite"></div>
    <button class="primary-action" type="submit" data-calculate-score="true" disabled>计算综合分</button>
  </form>`;
}

export function renderScoreCalculatorPage(filters = {}) {
  const cards = listSchoolGuideCards({ sort: "name" });
  const entries = calculatorSchoolEntries(cards);
  const selection = resolveCalculatorSelection(filters, entries, cards);
  const detail = selection.schoolId && selection.year
    ? getSchoolDetail({ schoolId: selection.schoolId, year: selection.year })
    : null;

  return renderStudentPage({
    title: `综合分计算器 | ${productName}`,
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "form",
      title: "计算器",
      backHref: "/schools",
      backLabel: "返回院校",
      submitState: "官方来源"
    }),
    content: `
      <section class="page-heading" aria-labelledby="calculator-title">
        <p class="eyebrow">已发布公式计算器</p>
        <h1 id="calculator-title">综合分计算器</h1>
        <p class="lead">根据所选院校已发布的广东综评公式和官方成绩字段计算综合分。</p>
      </section>

      <section class="section calculator-steps" aria-label="综合分计算步骤">
        <article class="calculator-step">
          <div class="step-marker">第 1 步</div>
          <div class="section-heading"><h2>选择院校和年份</h2></div>
          ${renderCalculatorSelectionForm(entries, selection.schoolId, selection.year)}
        </article>

        <article class="calculator-step">
          <div class="step-marker">第 2 步</div>
          <div class="section-heading"><h2>输入成绩</h2></div>
          ${renderCalculatorFormulaForm(detail)}
        </article>

        <article class="calculator-step">
          <div class="step-marker">第 3 步</div>
          <div class="section-heading"><h2>查看结果</h2></div>
          <div class="calculator-result" id="calculator-result" aria-live="polite">
            <p class="inline-empty">计算后将在这里显示结果。</p>
          </div>
        </article>
      </section>

      <script type="application/json" id="calculator-options">${calculatorOptionsJson(entries)}</script>
      <script src="/calculator.js" defer></script>
`
  });
}

const gradeLabels = Object.freeze({
  high_school_g1: "高一",
  high_school_g2: "高二",
  high_school_g3: "高三",
  graduated: "已毕业"
});

function gradeLabel(grade) {
  return gradeLabels[grade] ?? humanizeToken(grade);
}

function renderPersonalFeedback({ notice = "", error = "" } = {}) {
  if (error) {
    return `<p class="form-error" role="alert">${escapeHtml(error)}</p>`;
  }

  if (notice) {
    return `<p class="form-success" role="status">${escapeHtml(notice)}</p>`;
  }

  return "";
}

function renderAdminGuideFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "Drafts and pending review", filters.status ?? ""),
    renderOption("draft", "Draft", filters.status),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("published", "Published", filters.status),
    renderOption("archived", "Archived", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/guides" aria-label="Admin guide filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/guides">Reset</a>
    </div>
  </form>`;
}

function renderAdminSourceRows(guide) {
  return renderDetailRows([
    { label: "Source title", value: displayValue(guide.sourceTitle) },
    { label: "Source type", value: humanizeToken(displayValue(guide.sourceType)) },
    { label: "Official source", html: renderDetailLink(guide.officialSourceUrl, "Open source") },
    { label: "Source published", value: formatDate(guide.sourcePublishedAt) },
    { label: "Source updated", value: formatDate(guide.sourceUpdatedAt) }
  ]);
}

function renderAdminStructuredRows(guide) {
  const applicationWindow = `${formatDate(guide.applicationStartAt)} to ${formatDate(guide.applicationDeadlineAt)}`;

  return renderDetailRows([
    { label: "Application window", value: applicationWindow },
    { label: "Application status", value: humanizeToken(displayValue(guide.applicationStatus)) },
    { label: "Application URL", html: renderDetailLink(guide.applicationUrl, "Open application") },
    { label: "Majors", value: guide.majors.map((major) => `${major.name} (${major.track})`).join("; ") || pendingSupplementText },
    { label: "Subject requirements", value: displayValue(guide.subjectRequirements, pendingSupplementText) },
    { label: "Academic test", value: displayValue(guide.academicTestRequirements, pendingSupplementText) },
    { label: "Assessment method", value: displayValue(guide.assessmentMethod, pendingSupplementText) },
    { label: "Admission rule", value: displayValue(guide.admissionRule, pendingSupplementText) }
  ]);
}

function renderAdminAuditTrail(guide) {
  const audit = guide.reviewAudit ?? [];

  if (audit.length === 0) {
    return `<p class="inline-empty">No review operations recorded.</p>`;
  }

  return `<ol class="admin-audit-list">${audit
    .map((entry) => `<li>
      <strong>${escapeHtml(humanizeToken(entry.operation))}</strong>
      <span>${escapeHtml(entry.operatorNickname)} (${escapeHtml(entry.operatorRole)})</span>
      <em>${escapeHtml(formatDate(entry.operatedAt))}</em>
      ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
    </li>`)
    .join("")}</ol>`;
}

function renderAdminGuideActions(guide) {
  const encodedId = escapeHtml(encodeURIComponent(guide.id));

  return `<div class="admin-action-row" aria-label="Guide review actions">
    <form method="post" action="/admin/guides/${encodedId}/submit-review">
      <input type="hidden" name="note" value="Submitted from admin guide detail drawer after source and field review.">
      <button class="secondary-action" type="submit">Submit review</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/publish">
      <input type="hidden" name="note" value="Published from admin guide detail drawer with student-visible preview checked.">
      <button class="primary-action" type="submit">Publish</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/return">
      <input type="hidden" name="note" value="Returned from admin guide detail drawer; reviewer reason required in workflow notes.">
      <button class="secondary-action" type="submit">Return</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/pending-supplement">
      <input type="hidden" name="note" value="Marked pending supplement from admin guide detail drawer.">
      <button class="secondary-action" type="submit">Pending supplement</button>
    </form>
    <form method="post" action="/admin/guides/${encodedId}/archive">
      <input type="hidden" name="note" value="Archived from admin guide detail drawer after reviewer check.">
      <button class="secondary-action" type="submit">Archive</button>
    </form>
  </div>`;
}

function guideMissingFieldCount(guide) {
  const requiredFields = [
    guide.officialSourceUrl,
    guide.sourceTitle,
    guide.sourcePublishedAt ?? guide.sourceUpdatedAt,
    guide.applicationUrl,
    guide.applicationDeadlineAt,
    guide.majors,
    guide.subjectRequirements,
    guide.academicTestRequirements,
    guide.assessmentMethod,
    guide.admissionRule
  ];

  return requiredFields.filter((value) => {
    if (Array.isArray(value)) {
      return value.length === 0;
    }

    return !value;
  }).length;
}

function guideFieldState(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? "Confirmed" : "Pending supplement";
  }

  return value ? "Confirmed" : "Pending supplement";
}

function renderAdminGuideFieldConfirmationRows(guide) {
  return renderDetailRows([
    { label: "Application URL", value: guideFieldState(guide.applicationUrl) },
    { label: "Application deadline", value: guideFieldState(guide.applicationDeadlineAt) },
    { label: "Majors", value: guideFieldState(guide.majors) },
    { label: "Subject requirements", value: guideFieldState(guide.subjectRequirements) },
    { label: "Assessment method", value: guideFieldState(guide.assessmentMethod) },
    { label: "Admission rule", value: guideFieldState(guide.admissionRule) }
  ]);
}

function renderAdminGuideTable(reviews) {
  return renderAdminTable({
    caption: "Guide review queue table",
    headers: ["School", "Guide", "Year", "Status", "Source type", "Missing fields", "Updated", "Detail"],
    emptyText: "No guide records match this review queue.",
    rows: reviews.map(({ guide, school }) => `<tr>
      <th scope="row">${escapeHtml(school.name)}</th>
      <td>${escapeHtml(guide.guideTitle)}</td>
      <td>${escapeHtml(guide.admissionYear)}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(guide.status))}</span></td>
      <td>${escapeHtml(humanizeToken(guide.sourceType))}</td>
      <td>${escapeHtml(guideMissingFieldCount(guide))}</td>
      <td>${escapeHtml(formatDate(guide.updatedAt))}</td>
      <td><a class="text-link" href="#admin-guide-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminGuidePreview(guide, school) {
  return renderDetailRows([
    { label: "Student title", value: `${school.name} ${guide.admissionYear}` },
    { label: "Guide summary", value: guide.summary },
    { label: "Application deadline", value: formatDate(guide.applicationDeadlineAt) },
    { label: "Missing fields", value: `${guideMissingFieldCount(guide)} pending supplement` }
  ]);
}

function renderAdminGuideDetailPanel(reviews) {
  const selected = reviews[0];

  if (!selected) {
    return renderAdminPanel({
      id: "admin-guide-detail",
      title: "Guide detail review",
      kicker: "Select a queue row after records are available.",
      sections: [
        renderAdminPanelSection("Student-visible preview", `<p class="inline-empty">No guide record selected.</p>`)
      ]
    });
  }

  const { guide, school } = selected;

  return renderAdminPanel({
    id: "admin-guide-detail",
    title: "Guide detail review",
    kicker: `${school.name} - ${guide.admissionYear} - ${guide.guideTitle} - version ${guide.version}`,
    sections: [
      renderAdminPanelSection("Student-visible preview", renderAdminGuidePreview(guide, school)),
      renderAdminPanelSection("Extracted fields", renderAdminStructuredRows(guide), "Structured fields beside official source"),
      renderAdminPanelSection("Official source preview or link", renderAdminSourceRows(guide)),
      renderAdminPanelSection("Field-level confirmation state", renderAdminGuideFieldConfirmationRows(guide)),
      renderAdminPanelSection("Review audit", renderAdminAuditTrail(guide))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Reason / audit note for publish, return, supplement, or archive</span>
        <textarea rows="2" required placeholder="Official source checked; missing fields are marked for students."></textarea>
      </label>
      ${renderAdminGuideActions(guide)}`
  });
}

function renderAdminGuideCards(reviews) {
  if (reviews.length === 0) {
    return `<p class="empty-state">No guide records match this review queue.</p>`;
  }

  return reviews
    .map(({ guide, school }) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(guide.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(guide.status))}</span>
        ${guide.supplementStatus ? `<span class="muted-badge">${escapeHtml(humanizeToken(guide.supplementStatus))}</span>` : ""}
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(guide.guideTitle)}</h3>
          <p class="section-kicker">${escapeHtml(school.name)} - version ${escapeHtml(guide.version)}</p>
        </div>
        ${renderAdminGuideActions(guide)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Official source attribution">
          <h4>Official source attribution</h4>
          ${renderAdminSourceRows(guide)}
        </section>
        <section class="admin-review-section" aria-label="Extracted structured fields">
          <h4>Extracted fields</h4>
          ${renderAdminStructuredRows(guide)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Review audit trail">
        <h4>Review audit</h4>
        ${renderAdminAuditTrail(guide)}
      </section>
    </article>`)
    .join("");
}

export function renderAdminGuideReviewPage({ reviews, filters = {}, user }) {
  return renderAdminShell({
    title: `Guide Review | ${productName}`,
    currentKey: "guides",
    eyebrow: "Official guide review",
    heading: "Guide review queue",
    description: "Review draft and pending official guide records before they become visible to students.",
    user,
    content: `
      <section class="admin-section" aria-label="Admin guide filters">
        ${renderAdminGuideFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-guide-results-title">
        <div class="section-heading">
          <h2 id="admin-guide-results-title">${escapeHtml(reviews.length)} ${escapeHtml(pluralize(reviews.length, "guide"))} in review</h2>
          <p class="section-kicker">Queue table includes school, year, status, source type, missing-field count, and update time</p>
        </div>
        ${renderAdminGuideTable(reviews)}
      </section>`,
    detailPanel: renderAdminGuideDetailPanel(reviews)
  });
}

function renderAdminTimelineFilters(filters = {}) {
  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/timeline" aria-label="Admin timeline filters">
    <label class="filter-field">
      <span>Year</span>
      <input name="year" inputmode="numeric" value="${escapeHtml(filters.year ?? "")}" placeholder="2026">
    </label>
    <label class="filter-field">
      <span>School id</span>
      <input name="schoolId" value="${escapeHtml(filters.schoolId ?? "")}" placeholder="Optional school id">
    </label>
    <label class="filter-field">
      <span>Event key</span>
      <input name="eventKey" value="${escapeHtml(filters.eventKey ?? "")}" placeholder="application_deadline">
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/timeline">Reset</a>
    </div>
  </form>`;
}

function renderAdminTimelineOverrideForm(node) {
  return `<form class="admin-inline-form" method="post" action="/admin/timeline/overrides" aria-label="Override ${escapeHtml(node.title)}">
    <input type="hidden" name="admissionGuideId" value="${escapeHtml(node.admissionGuideId)}">
    <input type="hidden" name="eventKey" value="${escapeHtml(node.eventKey)}">
    <label class="form-field">
      <span>Title</span>
      <input name="title" value="${escapeHtml(node.title)}" required>
    </label>
    <label class="form-field">
      <span>Start date</span>
      <input name="startsAt" value="${escapeHtml(node.startsAt ?? "")}" placeholder="YYYY-MM-DD or ISO time">
    </label>
    <label class="form-field">
      <span>End date</span>
      <input name="endsAt" value="${escapeHtml(node.endsAt ?? "")}" placeholder="YYYY-MM-DD or ISO time">
    </label>
    <label class="form-field admin-wide-field">
      <span>Description</span>
      <textarea name="description" rows="3">${escapeHtml(node.description ?? "")}</textarea>
    </label>
    <label class="form-field admin-wide-field">
      <span>Override reason</span>
      <textarea name="overrideReason" rows="2" required placeholder="Official notice checked and date/title corrected"></textarea>
    </label>
    <div class="form-actions admin-wide-field">
      <button class="primary-action" type="submit">Save override</button>
    </div>
  </form>`;
}

function renderAdminTimelineCards(timelineNodes) {
  if (timelineNodes.length === 0) {
    return `<p class="empty-state">No generated timeline nodes match these filters.</p>`;
  }

  return timelineNodes
    .map((node) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(node.guide.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(node.eventKey))}</span>
        <span class="muted-badge">${escapeHtml(humanizeToken(node.source))}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(node.title)}</h3>
          <p class="section-kicker">${escapeHtml(node.school.name)} - ${escapeHtml(formatDate(node.startsAt ?? node.endsAt))}</p>
        </div>
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Guide-generated timeline data">
          <h4>Guide-generated event</h4>
          ${renderDetailRows([
            { label: "Generated title", value: node.generated.title },
            { label: "Generated start", value: formatDate(node.generated.startsAt) },
            { label: "Generated end", value: formatDate(node.generated.endsAt) },
            { label: "Guide", value: node.guide.guideTitle }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Manual timeline override">
          <h4>Manual override</h4>
          ${renderDetailRows([
            { label: "Current title", value: node.title },
            { label: "Current start", value: formatDate(node.startsAt) },
            { label: "Current end", value: formatDate(node.endsAt) },
            { label: "Description", value: displayValue(node.description) },
            { label: "Last reason", value: displayValue(node.override?.reason) }
          ])}
          ${renderAdminTimelineOverrideForm(node)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Timeline audit trail">
        <h4>Timeline audit</h4>
        ${renderAdminAuditTrail({ reviewAudit: node.override?.reviewAudit ?? [] })}
      </section>
    </article>`)
    .join("");
}

function renderAdminTimelineTable(timelineNodes) {
  return renderAdminTable({
    caption: "Timeline management generated nodes table",
    headers: ["School", "Year", "Node type", "Date", "Date precision", "Source", "Manual override", "Student status", "Detail"],
    emptyText: "No generated timeline nodes match these filters.",
    rows: timelineNodes.map((node) => `<tr>
      <th scope="row">${escapeHtml(node.school.name)}</th>
      <td>${escapeHtml(node.guide.admissionYear)}</td>
      <td>${escapeHtml(humanizeToken(node.eventKey))}</td>
      <td>${escapeHtml(formatDate(node.startsAt ?? node.endsAt))}</td>
      <td>${escapeHtml(node.isDateKnown ? "Date known" : "Date unknown")}</td>
      <td>${escapeHtml(humanizeToken(node.source))}</td>
      <td>${escapeHtml(node.override ? "Manual override" : "Generated")}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(node.status))}</span></td>
      <td><a class="text-link" href="#admin-timeline-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminTimelineDetailPanel(timelineNodes) {
  const node = timelineNodes[0];

  if (!node) {
    return renderAdminPanel({
      id: "admin-timeline-detail",
      title: "Timeline node detail",
      kicker: "Select a generated node after records are available.",
      sections: [
        renderAdminPanelSection("Student-side status", `<p class="inline-empty">No timeline node selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-timeline-detail",
    title: "Timeline node detail",
    kicker: `${node.school.name} - ${node.guide.admissionYear} - ${humanizeToken(node.eventKey)}`,
    sections: [
      renderAdminPanelSection("Student-side status", renderDetailRows([
        { label: "Student label", value: node.title },
        { label: "Date shown to students", value: formatDate(node.startsAt ?? node.endsAt) },
        { label: "Status", value: humanizeToken(node.status) },
        { label: "Unknown-date handling", value: node.isDateKnown ? "Date shown" : "To be announced" }
      ])),
      renderAdminPanelSection("Original generated data", renderDetailRows([
        { label: "Generated title", value: node.generated.title },
        { label: "Generated start", value: formatDate(node.generated.startsAt) },
        { label: "Generated end", value: formatDate(node.generated.endsAt) },
        { label: "Guide", value: node.guide.guideTitle }
      ])),
      renderAdminPanelSection("Manual override state", renderDetailRows([
        { label: "Override source", value: humanizeToken(node.source) },
        { label: "Last reason", value: displayValue(node.override?.reason) },
        { label: "Override updated", value: node.override?.updatedAt ? formatDate(node.override.updatedAt) : missingOfficialText }
      ])),
      renderAdminPanelSection("Timeline audit", renderAdminAuditTrail({ reviewAudit: node.override?.reviewAudit ?? [] }))
    ],
    actions: renderAdminTimelineOverrideForm(node)
  });
}

export function renderAdminTimelineManagementPage({ timelineNodes, filters = {}, user }) {
  return renderAdminShell({
    title: `Timeline Management | ${productName}`,
    currentKey: "timeline",
    eyebrow: "Timeline management",
    heading: "Timeline overrides",
    description: "Review guide-generated timeline events and apply audited manual overrides for dates, titles, and descriptions.",
    user,
    content: `
      <section class="admin-section" aria-label="Admin timeline filters">
        ${renderAdminTimelineFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-timeline-results-title">
        <div class="section-heading">
          <h2 id="admin-timeline-results-title">${escapeHtml(timelineNodes.length)} ${escapeHtml(pluralize(timelineNodes.length, "timeline node"))}</h2>
          <p class="section-kicker">Generated nodes preserve original data when a manual override is applied</p>
        </div>
        ${renderAdminTimelineTable(timelineNodes)}
      </section>`,
    detailPanel: renderAdminTimelineDetailPanel(timelineNodes)
  });
}

function defaultFormulaConfigJson() {
  return safeScriptJson({
    inputs: [
      { key: "gaokao", label: "Gaokao score", maxScore: 750, weight: 0.85 },
      { key: "schoolAssessment", label: "School assessment", maxScore: 100, weight: 0.15 }
    ],
    outputMaxScore: 100,
    customConfig: {
      note: "Optional reviewer-only custom configuration"
    }
  });
}

function defaultFormulaSamplesJson() {
  return safeScriptJson([
    {
      name: "Full score sample",
      scores: { gaokao: 750, schoolAssessment: 100 },
      expectedTotalScore: 100
    }
  ]);
}

function renderAdminFormulaFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "All formula statuses", filters.status ?? ""),
    renderOption("draft", "Draft", filters.status),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("published", "Published", filters.status),
    renderOption("archived", "Archived", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/formulas" aria-label="Admin formula filters">
    <label class="filter-field">
      <span>Year</span>
      <input name="year" inputmode="numeric" value="${escapeHtml(filters.year ?? "")}" placeholder="2026">
    </label>
    <label class="filter-field">
      <span>School id</span>
      <input name="schoolId" value="${escapeHtml(filters.schoolId ?? "")}" placeholder="Optional school id">
    </label>
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/formulas">Reset</a>
    </div>
  </form>`;
}

function renderFormulaDraftForm() {
  return `<form class="admin-draft-form" method="post" action="/admin/formulas" aria-label="Create or update formula draft">
    <div class="admin-form-grid">
      <label class="form-field">
        <span>Formula id for update</span>
        <input name="id" placeholder="Leave blank for a new draft">
      </label>
      <label class="form-field">
        <span>Admission guide id</span>
        <input name="admissionGuideId" placeholder="Current published guide id">
      </label>
      <label class="form-field">
        <span>School id</span>
        <input name="schoolId" placeholder="Required if guide id is blank">
      </label>
      <label class="form-field">
        <span>Year</span>
        <input name="year" inputmode="numeric" placeholder="2026">
      </label>
      <label class="form-field">
        <span>Status</span>
        <select name="status">
          <option value="draft">Draft</option>
          <option value="pending_review">Pending review</option>
        </select>
      </label>
      <label class="form-field">
        <span>Formula type</span>
        <select name="formulaType">
          <option value="weighted_sum">Weighted sum</option>
          <option value="custom">Custom with weighted inputs</option>
        </select>
      </label>
      <label class="form-field admin-wide-field">
        <span>Formula name</span>
        <input name="formulaName" placeholder="85/15 comprehensive score">
      </label>
      <label class="form-field admin-wide-field">
        <span>Official source URL</span>
        <input name="officialSourceUrl" placeholder="https://example.edu/source">
      </label>
      <label class="form-field admin-wide-field">
        <span>Explanation</span>
        <textarea name="explanation" rows="3" placeholder="Explain the score inputs, max scores, and weights"></textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Inputs schema and weights JSON</span>
        <textarea name="formulaConfig" rows="8">${escapeHtml(defaultFormulaConfigJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Sample calculation tests JSON</span>
        <textarea name="sampleTests" rows="6">${escapeHtml(defaultFormulaSamplesJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Review note</span>
        <textarea name="note" rows="2" placeholder="Source checked against official guide"></textarea>
      </label>
      <div class="form-actions admin-wide-field">
        <button class="primary-action" type="submit">Save formula draft</button>
      </div>
    </div>
  </form>`;
}

function renderFormulaInputRows(formula) {
  return renderDetailRows([
    { label: "Formula type", value: humanizeToken(formula.formulaType) },
    { label: "Output max score", value: formula.formulaConfig.outputMaxScore },
    {
      label: "Inputs",
      value: formula.formulaConfig.inputs
        .map((input) => `${input.label}: max ${input.maxScore}, weight ${input.weight}`)
        .join("; ")
    },
    { label: "Custom config", value: formula.formulaConfig.customConfig ? JSON.stringify(formula.formulaConfig.customConfig) : missingOfficialText },
    { label: "Official source", html: renderDetailLink(formula.officialSourceUrl, "Open source") }
  ]);
}

function renderFormulaSampleResults(sampleResults) {
  if (!sampleResults || sampleResults.length === 0) {
    return `<p class="inline-empty">No sample calculation tests configured.</p>`;
  }

  return `<ol class="admin-audit-list">${sampleResults
    .map((sample) => `<li>
      <strong>${escapeHtml(sample.name)}</strong>
      <span>${sample.passed ? "Passed" : "Failed"}</span>
      <em>Expected ${escapeHtml(sample.expectedTotalScore)} / Actual ${escapeHtml(sample.actualTotalScore ?? "Error")}</em>
      ${sample.error ? `<p>${escapeHtml(sample.error)}</p>` : ""}
    </li>`)
    .join("")}</ol>`;
}

function renderAdminFormulaActions(formula) {
  const encodedId = escapeHtml(encodeURIComponent(formula.id));

  return `<div class="admin-action-row" aria-label="Formula actions">
    <form method="post" action="/admin/formulas/${encodedId}/publish">
      <input type="hidden" name="note" value="Published from formula detail drawer after source link and sample tests were checked.">
      <button class="primary-action" type="submit">Publish formula</button>
    </form>
  </div>`;
}

function renderAdminFormulaCards(formulas) {
  if (formulas.length === 0) {
    return `<p class="empty-state">No formulas match these filters.</p>`;
  }

  return formulas
    .map(({ formula, school, guide, sampleResults }) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(formula.admissionYear)}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(formula.status))}</span>
        <span class="muted-badge">Version ${escapeHtml(formula.version)}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(formula.formulaName)}</h3>
          <p class="section-kicker">${escapeHtml(school.name)} - ${escapeHtml(guide.guideTitle)}</p>
        </div>
        ${renderAdminFormulaActions(formula)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Formula configuration">
          <h4>Inputs schema and weights</h4>
          ${renderFormulaInputRows(formula)}
        </section>
        <section class="admin-review-section" aria-label="Formula sample tests">
          <h4>Sample calculation tests</h4>
          ${renderFormulaSampleResults(sampleResults)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Formula explanation">
        <h4>Explanation</h4>
        <p>${escapeHtml(formula.explanation)}</p>
      </section>
      <section class="admin-review-section" aria-label="Formula audit trail">
        <h4>Formula audit</h4>
        ${renderAdminAuditTrail(formula)}
      </section>
    </article>`)
    .join("");
}

function formulaHasPassingSample(sampleResults = []) {
  return sampleResults.some((sample) => sample.passed);
}

function renderAdminFormulaTable(formulas) {
  return renderAdminTable({
    caption: "Formula management list table",
    headers: ["School", "Year", "Formula", "Status", "Source", "Passing sample", "Updated", "Detail"],
    emptyText: "No formulas match these filters.",
    rows: formulas.map(({ formula, school, sampleResults }) => `<tr>
      <th scope="row">${escapeHtml(school.name)}</th>
      <td>${escapeHtml(formula.admissionYear)}</td>
      <td>${escapeHtml(formula.formulaName)}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(formula.status))}</span></td>
      <td>${formula.officialSourceUrl ? "Official source linked" : "Source required"}</td>
      <td>${escapeHtml(formulaHasPassingSample(sampleResults) ? "Passed" : "Required before publication")}</td>
      <td>${escapeHtml(formatDate(formula.updatedAt))}</td>
      <td><a class="text-link" href="#admin-formula-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminFormulaStudentPreview({ formula, school }) {
  return renderDetailRows([
    { label: "Calculator school", value: school.name },
    { label: "Student formula name", value: formula.formulaName },
    { label: "Student formula explanation", value: formula.explanation },
    { label: "Student availability", value: formula.status === "published" ? "Visible in calculator" : "Hidden until published" }
  ]);
}

function renderAdminFormulaDetailPanel(formulas) {
  const detail = formulas[0];

  if (!detail) {
    return renderAdminPanel({
      id: "admin-formula-detail",
      title: "Formula detail review",
      kicker: "Select a formula after records are available.",
      sections: [
        renderAdminPanelSection("Student-side preview", `<p class="inline-empty">No formula selected.</p>`)
      ]
    });
  }

  const { formula, school, guide, sampleResults } = detail;

  return renderAdminPanel({
    id: "admin-formula-detail",
    title: "Formula detail review",
    kicker: `${school.name} - ${formula.admissionYear} - version ${formula.version}`,
    sections: [
      renderAdminPanelSection("Student-side preview", renderAdminFormulaStudentPreview({ formula, school })),
      renderAdminPanelSection("Formula configuration", renderFormulaInputRows(formula)),
      renderAdminPanelSection("Test sample area", renderFormulaSampleResults(sampleResults)),
      renderAdminPanelSection("Official source and publication gate", renderDetailRows([
        { label: "Guide", value: guide.guideTitle },
        { label: "Official source", html: renderDetailLink(formula.officialSourceUrl, "Open source") },
        { label: "Publication requirement", value: formulaHasPassingSample(sampleResults) ? "At least one sample calculation passed" : "A passing sample calculation is required" }
      ])),
      renderAdminPanelSection("Formula audit", renderAdminAuditTrail(formula))
    ],
    actions: renderAdminFormulaActions(formula)
  });
}

export function renderAdminFormulaManagementPage({ formulas, filters = {}, user }) {
  return renderAdminShell({
    title: `Formula Management | ${productName}`,
    currentKey: "formulas",
    eyebrow: "Formula management",
    heading: "Score formula drafts",
    description: "Create, update, sample-test, and publish score formula records before they appear in the student calculator.",
    user,
    content: `
      <section class="admin-section" aria-label="Formula editor">
        <div class="section-heading">
          <h2>Formula editor</h2>
          <p class="section-kicker">Inputs schema, max scores, weights, source URL, status, and sample tests</p>
        </div>
        ${renderFormulaDraftForm()}
      </section>
      <section class="admin-section" aria-label="Admin formula filters">
        ${renderAdminFormulaFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-formula-results-title">
        <div class="section-heading">
          <h2 id="admin-formula-results-title">${escapeHtml(formulas.length)} ${escapeHtml(pluralize(formulas.length, "formula"))}</h2>
          <p class="section-kicker">Drafts stay hidden until publication has a passing sample test</p>
        </div>
        ${renderAdminFormulaTable(formulas)}
      </section>`,
    detailPanel: renderAdminFormulaDetailPanel(formulas)
  });
}

function defaultIngestionSourcesJson() {
  return JSON.stringify([
    {
      id: "source-official-1",
      sourceUrl: "https://eea.gd.gov.cn/admission/example",
      title: "Guangdong Education Examination Authority comprehensive evaluation notice",
      sourceType: "guangdong_education_exam_authority",
      status: "accepted"
    }
  ], null, 2);
}

function defaultExtractedGuideFieldsJson() {
  return JSON.stringify({
    guideTitle: {
      value: "Example 2026 Guangdong Comprehensive Evaluation Guide",
      sourceDocumentId: "source-official-1",
      confidence: 0.91
    },
    summary: {
      value: "Draft extraction summary for manual data review.",
      sourceDocumentId: "source-official-1",
      confidence: 0.87
    },
    applicationStatus: {
      value: "open",
      manualNote: "Reviewer can adjust after checking official attachments."
    },
    majors: {
      value: [],
      manualNote: "No major list extracted yet."
    }
  }, null, 2);
}

function renderAdminIngestionFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "All run statuses", filters.status ?? ""),
    renderOption("pending", "Pending", filters.status),
    renderOption("running", "Running", filters.status),
    renderOption("succeeded", "Succeeded", filters.status),
    renderOption("failed", "Failed", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/ingestion-runs" aria-label="Admin ingestion filters">
    <label class="filter-field">
      <span>Year</span>
      <input name="year" inputmode="numeric" value="${escapeHtml(filters.year ?? "")}" placeholder="2026">
    </label>
    <label class="filter-field">
      <span>School id</span>
      <input name="schoolId" value="${escapeHtml(filters.schoolId ?? "")}" placeholder="Optional school id">
    </label>
    <label class="filter-field">
      <span>Keyword</span>
      <input name="keyword" value="${escapeHtml(filters.keyword ?? "")}" placeholder="Source or field keyword">
    </label>
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/ingestion-runs">Reset</a>
    </div>
  </form>`;
}

function renderIngestionCreateForm() {
  return `<form class="admin-draft-form" id="admin-ingestion-create-form" method="post" action="/admin/ingestion-runs" aria-label="Create ingestion run">
    <div class="admin-form-grid">
      <label class="form-field">
        <span>Year</span>
        <input name="year" inputmode="numeric" placeholder="2026">
      </label>
      <label class="form-field">
        <span>School id</span>
        <input name="schoolId" placeholder="Required for draft creation">
      </label>
      <label class="form-field">
        <span>Keyword</span>
        <input name="keyword" placeholder="School or guide keyword">
      </label>
      <label class="form-field">
        <span>Confidence score</span>
        <input name="confidenceScore" inputmode="decimal" placeholder="0.86">
      </label>
      <label class="form-field admin-wide-field">
        <span>Source document candidates JSON</span>
        <textarea name="sourceDocuments" rows="8">${escapeHtml(defaultIngestionSourcesJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Extracted guide fields JSON</span>
        <textarea name="extractedGuideFields" rows="10">${escapeHtml(defaultExtractedGuideFieldsJson())}</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Timeline candidates JSON</span>
        <textarea name="timelineCandidates" rows="4">[]</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Formula candidates JSON</span>
        <textarea name="formulaCandidates" rows="4">[]</textarea>
      </label>
      <label class="form-field admin-wide-field">
        <span>Review note</span>
        <textarea name="reviewNote" rows="2" placeholder="Manual checks needed before publishing"></textarea>
      </label>
      <label class="form-field checkbox-field admin-wide-field">
        <input type="checkbox" name="createDraft" value="true" checked>
        <span>Generate guide draft from accepted official source and extracted fields</span>
      </label>
      <div class="form-actions admin-wide-field">
        <button class="primary-action" type="submit">Create run and draft guide</button>
      </div>
    </div>
  </form>`;
}

function renderIngestionSourceDocuments(sourceDocuments) {
  if (sourceDocuments.length === 0) {
    return `<p class="inline-empty">No source document candidates stored.</p>`;
  }

  return `<ol class="admin-audit-list ingestion-source-list">${sourceDocuments
    .map((document) => `<li>
      <strong>${escapeHtml(document.sourcePriority)}. ${escapeHtml(document.title)}</strong>
      <span>${escapeHtml(document.sourcePriorityLabel)} - ${escapeHtml(humanizeToken(document.candidateStatus))}</span>
      <em>${escapeHtml(document.contentHash.slice(0, 12))}</em>
      ${renderDetailRows([
        { label: "Source type", value: humanizeToken(document.sourceType) },
        { label: "Authority role", value: humanizeToken(document.authorityRole) },
        { label: "Fetched", value: formatDate(document.fetchedAt) },
        { label: "Raw text asset", value: document.rawTextAssetUrl },
        { label: "Source URL", html: renderDetailLink(document.sourceUrl, "Open source") }
      ])}
    </li>`)
    .join("")}</ol>`;
}

function traceLabel(trace) {
  if (trace.sourceDocumentId) {
    const note = trace.manualNote ? `; manual note: ${trace.manualNote}` : "";
    return `${trace.sourceTitle ?? trace.sourceDocumentId}${note}`;
  }

  return trace.manualNote ?? missingOfficialText;
}

function renderTraceableFieldRows(fields) {
  const entries = Object.entries(fields);

  if (entries.length === 0) {
    return `<p class="inline-empty">No extracted guide fields stored.</p>`;
  }

  return renderDetailRows(entries.map(([name, field]) => ({
    label: name,
    value: `${JSON.stringify(field.value)} | trace: ${traceLabel(field.trace)}`
  })));
}

function renderTraceableCandidateList(candidates, emptyText) {
  if (candidates.length === 0) {
    return `<p class="inline-empty">${escapeHtml(emptyText)}</p>`;
  }

  return `<ol class="admin-audit-list">${candidates
    .map((candidate) => `<li>
      <strong>${escapeHtml(candidate.eventKey ?? candidate.formulaName ?? candidate.title ?? "Candidate")}</strong>
      <span>${escapeHtml(traceLabel(candidate.trace))}</span>
      <em>${escapeHtml(candidate.confidence ?? "No confidence")}</em>
      <p>${escapeHtml(JSON.stringify(candidate))}</p>
    </li>`)
    .join("")}</ol>`;
}

function renderIngestionRunCards(ingestionRuns) {
  if (ingestionRuns.length === 0) {
    return `<p class="empty-state">No ingestion runs match these filters.</p>`;
  }

  return ingestionRuns
    .map((run) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(run.year ?? "Any year")}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(run.status))}</span>
        <span class="muted-badge">Confidence ${escapeHtml(run.confidenceScore ?? "not set")}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(run.keyword || run.school?.name || "Ingestion run")}</h3>
          <p class="section-kicker">${escapeHtml(run.id)}${run.draftGuide ? ` - draft ${escapeHtml(run.draftGuide.id)}` : ""}</p>
        </div>
        <a class="secondary-action" href="/admin/ingestion-runs/${escapeHtml(encodeURIComponent(run.id))}?format=json">JSON detail</a>
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Source document candidates">
          <h4>Source document candidates</h4>
          ${renderIngestionSourceDocuments(run.sourceDocuments)}
        </section>
        <section class="admin-review-section" aria-label="Traceable extracted guide fields">
          <h4>Extracted guide fields</h4>
          ${renderTraceableFieldRows(run.extractedGuideFields)}
        </section>
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Timeline candidates">
          <h4>Timeline candidates</h4>
          ${renderTraceableCandidateList(run.timelineCandidates, "No timeline candidates stored.")}
        </section>
        <section class="admin-review-section" aria-label="Formula candidates">
          <h4>Formula candidates</h4>
          ${renderTraceableCandidateList(run.formulaCandidates, "No formula candidates stored.")}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Draft-only output">
        <h4>Draft-only output</h4>
        ${run.draftGuide
          ? renderDetailRows([
              { label: "Draft guide", value: run.draftGuide.guideTitle },
              { label: "Draft status", value: humanizeToken(run.draftGuide.status) },
              { label: "Student visibility", value: "Hidden until manual publish" }
            ])
          : `<p class="inline-empty">No guide draft was created for this run.</p>`}
      </section>
    </article>`)
    .join("");
}

function renderIngestionRunTable(ingestionRuns) {
  return renderAdminTable({
    caption: "Data ingestion task list",
    headers: ["Task", "Status", "Sources", "Extraction confidence", "Creator", "Created", "Detail"],
    emptyText: "No ingestion runs match these filters.",
    rows: ingestionRuns.map((run) => `<tr>
      <th scope="row">${escapeHtml(run.keyword || run.school?.name || run.id)}</th>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(run.status))}</span></td>
      <td>${escapeHtml(run.sourceDocuments.length)}</td>
      <td>${escapeHtml(run.confidenceScore ?? "Manual review required")}</td>
      <td>${escapeHtml(run.createdBy?.operatorNickname ?? "Unknown creator")}</td>
      <td>${escapeHtml(formatDate(run.createdAt))}</td>
      <td><a class="text-link" href="#admin-ingestion-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderIngestionManualConfirmationItems(run) {
  const items = Object.entries(run.extractedGuideFields)
    .filter(([, field]) => field.trace?.manualNote || (field.confidence !== null && field.confidence < 0.88))
    .map(([fieldName, field]) => `<li>
      <strong>${escapeHtml(fieldName)}</strong>
      <span>${escapeHtml(field.trace?.manualNote ?? "Low confidence extraction needs reviewer confirmation")}</span>
      <em>Confidence ${escapeHtml(field.confidence ?? "not set")}</em>
    </li>`);

  if (items.length === 0) {
    return `<p class="inline-empty">No manual-confirmation items detected for this run.</p>`;
  }

  return `<ol class="admin-audit-list">${items.join("")}</ol>`;
}

function renderIngestionDraftCreationState(run) {
  return run.draftGuide
    ? renderDetailRows([
        { label: "Draft guide", value: run.draftGuide.guideTitle },
        { label: "Draft status", value: humanizeToken(run.draftGuide.status) },
        { label: "Student visibility", value: "Hidden until manual guide review publishes it" }
      ])
    : `<div class="admin-inline-form">
        <p class="section-kicker">No draft guide is attached. Use the create task form with draft generation enabled after source checks.</p>
        <button class="secondary-action" type="submit" form="admin-ingestion-create-form">Generate guide draft</button>
      </div>`;
}

function renderAdminIngestionDetailPanel(ingestionRuns) {
  const run = ingestionRuns[0];

  if (!run) {
    return renderAdminPanel({
      id: "admin-ingestion-detail",
      title: "Ingestion detail",
      kicker: "Select a run after records are available.",
      sections: [
        renderAdminPanelSection("Source candidates", `<p class="inline-empty">No ingestion run selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-ingestion-detail",
    title: "Ingestion detail",
    kicker: `${run.keyword || run.school?.name || run.id} - ${humanizeToken(run.status)}`,
    sections: [
      renderAdminPanelSection("Run status and confidence", renderDetailRows([
        { label: "Status", value: humanizeToken(run.status) },
        { label: "Extraction confidence", value: run.confidenceScore ?? "Manual review required" },
        { label: "Created by", value: run.createdBy?.operatorNickname ?? "Unknown creator" },
        { label: "Created", value: formatDate(run.createdAt) }
      ])),
      renderAdminPanelSection("Source document candidates", renderIngestionSourceDocuments(run.sourceDocuments)),
      renderAdminPanelSection("Traceable extracted guide fields", renderTraceableFieldRows(run.extractedGuideFields)),
      renderAdminPanelSection("Manual-confirmation items", renderIngestionManualConfirmationItems(run)),
      renderAdminPanelSection("Draft-guide creation", renderIngestionDraftCreationState(run))
    ]
  });
}

export function renderAdminIngestionRunPage({ ingestionRuns, filters = {}, user }) {
  return renderAdminShell({
    title: `AI Ingestion | ${productName}`,
    currentKey: "ingestion",
    eyebrow: "AI-assisted official source ingestion",
    heading: "Ingestion draft workflow",
    description: "Store official source candidates, extracted fields, timeline candidates, formula candidates, confidence, and review notes as draft-only review material.",
    user,
    content: `
      <section class="admin-section" aria-label="Create ingestion run">
        <div class="section-heading">
          <h2>Create ingestion run</h2>
          <p class="section-kicker">AI and extraction output can create drafts only; publishing stays in manual guide review</p>
        </div>
        ${renderIngestionCreateForm()}
      </section>
      <section class="admin-section" aria-label="Ingestion filters">
        ${renderAdminIngestionFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-ingestion-results-title">
        <div class="section-heading">
          <h2 id="admin-ingestion-results-title">${escapeHtml(ingestionRuns.length)} ${escapeHtml(pluralize(ingestionRuns.length, "ingestion run"))}</h2>
          <p class="section-kicker">Source priority: GEEA, CHSI/Yangguang Gaokao, university admissions, other official, discovery clues</p>
        </div>
        ${renderIngestionRunTable(ingestionRuns)}
      </section>`,
    detailPanel: renderAdminIngestionDetailPanel(ingestionRuns)
  });
}

function renderAdminModerationWarnings(moderation) {
  const warnings = moderation?.warnings ?? [];

  if (warnings.length === 0) {
    return `<p class="inline-empty">No prohibited-content or privacy warnings detected.</p>`;
  }

  return `<ol class="admin-audit-list">${warnings
    .map((warning) => `<li>
      <strong>${escapeHtml(warning.label)}</strong>
      <span>${escapeHtml(humanizeToken(warning.severity))}</span>
      <em>${escapeHtml(humanizeToken(warning.action))}</em>
      <p>${escapeHtml(warning.message)}</p>
    </li>`)
    .join("")}</ol>`;
}

function renderAdminExperienceFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "Pending review", filters.status ?? ""),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("published", "Published", filters.status),
    renderOption("returned", "Returned", filters.status),
    renderOption("hidden", "Hidden", filters.status),
    renderOption("banned", "Banned", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/experiences" aria-label="Experience moderation filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/experiences">Reset</a>
    </div>
  </form>`;
}

function renderAdminExperienceActions(experience) {
  const encodedId = escapeHtml(encodeURIComponent(experience.id));
  const actions = [
    { action: "approve", label: "Approve", className: "primary-action" },
    { action: "return", label: "Return for rewrite", className: "secondary-action" },
    { action: "hide", label: "Hide", className: "secondary-action" },
    { action: "ban", label: "Limit account", className: "secondary-action" }
  ];

  return `<div class="admin-action-row" aria-label="Experience moderation actions">${actions
    .map((item) => `<form method="post" action="/admin/experiences/${encodedId}/review">
      <input type="hidden" name="action" value="${escapeHtml(item.action)}">
      <input type="hidden" name="note" value="${escapeHtml(item.label)} from review queue">
      <button class="${escapeHtml(item.className)}" type="submit">${escapeHtml(item.label)}</button>
    </form>`)
    .join("")}</div>`;
}

function moderationRiskLabels(moderation) {
  const warnings = moderation?.warnings ?? [];

  if (warnings.length === 0) {
    return "No sensitive risk";
  }

  return warnings.map((warning) => warning.label).join(", ");
}

function renderAdminExperienceTable(experiences) {
  return renderAdminTable({
    caption: "Experience moderation pending queue",
    headers: ["School", "Year", "Stage", "Submitted", "Sensitive risk tags", "Detail"],
    emptyText: "No submitted experiences match this moderation queue.",
    rows: experiences.map((experience) => `<tr>
      <th scope="row">${escapeHtml(experience.school?.name ?? "Submitted experience")}</th>
      <td>${escapeHtml(experience.year)}</td>
      <td>${escapeHtml(humanizeToken(experience.stage))}</td>
      <td>${escapeHtml(formatDate(experience.createdAt))}</td>
      <td>${escapeHtml(moderationRiskLabels(experience.moderation))}</td>
      <td><a class="text-link" href="#admin-experience-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminExperienceStudentPreview(experience) {
  return renderDetailRows([
    { label: "School", value: experience.school?.name ?? missingOfficialText },
    { label: "Year and stage", value: `${experience.year} ${humanizeToken(experience.stage)}` },
    { label: "Assessment format", value: experience.assessmentFormat },
    { label: "Public summary", value: experience.summary },
    { label: "Verification label", value: experience.verificationStatus }
  ]);
}

function renderAdminExperienceDetailPanel(experiences) {
  const experience = experiences[0];

  if (!experience) {
    return renderAdminPanel({
      id: "admin-experience-detail",
      title: "Experience review detail",
      kicker: "Select a pending submission after records are available.",
      sections: [
        renderAdminPanelSection("Student-side preview", `<p class="inline-empty">No submitted experience selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-experience-detail",
    title: "Experience review detail",
    kicker: `${experience.school?.name ?? "Submitted experience"} - ${experience.year}`,
    sections: [
      renderAdminPanelSection("Student-side preview", renderAdminExperienceStudentPreview(experience)),
      renderAdminPanelSection("Submitted structured fields", renderDetailRows([
        { label: "Summary", value: experience.summary },
        { label: "Process", value: experience.processSummary },
        { label: "Question types", value: experience.questionTypes.join(", ") },
        { label: "Preparation", value: experience.preparationSummary },
        { label: "Advice", value: experience.advice }
      ])),
      renderAdminPanelSection("Sensitive content and privacy warnings", renderAdminModerationWarnings(experience.moderation)),
      renderAdminPanelSection("Blocked content boundaries", `<p class="section-kicker">Ongoing-exam content, undisclosed original questions, sales, ghostwriting, guaranteed admission claims, external traffic scams, and personal sensitive information must be returned, hidden, or account-limited before publication.</p>`),
      renderAdminPanelSection("Moderation audit", renderAdminAuditTrail({ reviewAudit: experience.reviewAudit }))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Reason for return, hide, or account limit</span>
        <textarea rows="2" required placeholder="Explain the rewrite request or risk decision for the audit trail."></textarea>
      </label>
      ${renderAdminExperienceActions(experience)}`
  });
}

function renderAdminExperienceCards(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">No submitted experiences match this moderation queue.</p>`;
  }

  return experiences
    .map((experience) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.year)}</span>
        <span class="soft-badge">${escapeHtml(experience.statusLabel)}</span>
        <span class="muted-badge">${escapeHtml(experience.verificationStatus)}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(experience.school?.name ?? "Submitted experience")}</h3>
          <p class="section-kicker">${escapeHtml(experience.authorNickname)} - ${escapeHtml(experience.assessmentFormat)}</p>
        </div>
        ${renderAdminExperienceActions(experience)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Submitted structured experience">
          <h4>Submitted experience</h4>
          ${renderDetailRows([
            { label: "Summary", value: experience.summary },
            { label: "Process", value: experience.processSummary },
            { label: "Question types", value: experience.questionTypes.join(", ") },
            { label: "Preparation", value: experience.preparationSummary },
            { label: "Advice", value: experience.advice }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Moderation warnings">
          <h4>Sensitive content and privacy warnings</h4>
          ${renderAdminModerationWarnings(experience.moderation)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Experience audit trail">
        <h4>Moderation audit</h4>
        ${renderAdminAuditTrail({ reviewAudit: experience.reviewAudit })}
      </section>
    </article>`)
    .join("");
}

export function renderAdminExperienceModerationPage({ experiences, filters = {}, user }) {
  return renderAdminShell({
    title: `Experience Moderation | ${productName}`,
    currentKey: "experiences",
    eyebrow: "Experience moderation",
    heading: "Experience moderation queue",
    description: "Review pending structured experiences, prohibited-content signals, and privacy warnings before student publication.",
    user,
    content: `
      <section class="admin-section" aria-label="Experience moderation filters">
        ${renderAdminExperienceFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-experience-results-title">
        <div class="section-heading">
          <h2 id="admin-experience-results-title">${escapeHtml(experiences.length)} ${escapeHtml(pluralize(experiences.length, "experience"))} in moderation</h2>
          <p class="section-kicker">Approval is blocked when rewrite-required warnings are present</p>
        </div>
        ${renderAdminExperienceTable(experiences)}
      </section>`,
    detailPanel: renderAdminExperienceDetailPanel(experiences)
  });
}

function renderAdminVerificationFilters(filters = {}) {
  const statusOptions = [
    renderOption("", "Pending review", filters.status ?? ""),
    renderOption("pending_review", "Pending review", filters.status),
    renderOption("verified", "Verified", filters.status),
    renderOption("rejected", "Rejected", filters.status),
    renderOption("returned", "Returned", filters.status)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/verifications" aria-label="Verification review filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/verifications">Reset</a>
    </div>
  </form>`;
}

function renderAdminVerificationActions(material) {
  const encodedId = escapeHtml(encodeURIComponent(material.id));
  const actions = [
    { action: "approve", label: "Approve material", className: "primary-action" },
    { action: "reject", label: "Reject material", className: "secondary-action" },
    { action: "return", label: "Return material", className: "secondary-action" }
  ];

  return `<div class="admin-action-row" aria-label="Verification review actions">${actions
    .map((item) => `<form method="post" action="/admin/verifications/${encodedId}/review">
      <input type="hidden" name="action" value="${escapeHtml(item.action)}">
      <input type="hidden" name="note" value="${escapeHtml(item.label)} from verification queue">
      <button class="${escapeHtml(item.className)}" type="submit">${escapeHtml(item.label)}</button>
    </form>`)
    .join("")}</div>`;
}

function renderAdminVerificationCards(verifications) {
  if (verifications.length === 0) {
    return `<p class="empty-state">No verification materials match this review queue.</p>`;
  }

  return verifications
    .map(({ material, experience, moderation }) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.year)}</span>
        <span class="soft-badge">${escapeHtml(material.status)}</span>
        <span class="muted-badge">${material.storageKeyPresent ? "Private file stored" : "Metadata only"}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(material.materialType)}</h3>
          <p class="section-kicker">${escapeHtml(experience.school?.name ?? "Submitted experience")} - ${escapeHtml(experience.authorNickname)}</p>
        </div>
        ${renderAdminVerificationActions(material)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Verification material metadata">
          <h4>Verification material metadata</h4>
          ${renderDetailRows([
            { label: "Material id", value: material.id },
            { label: "Experience id", value: material.experienceId },
            { label: "Storage file", value: material.storageKeyPresent ? "Reviewer-only private storage reference present" : "No private storage reference" },
            { label: "Metadata", value: Object.keys(material.metadata).length > 0 ? JSON.stringify(material.metadata) : missingOfficialText }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Verification privacy warnings">
          <h4>Privacy warning results</h4>
          ${renderAdminModerationWarnings(moderation)}
        </section>
      </div>
      <section class="admin-review-section" aria-label="Verification audit trail">
        <h4>Verification audit</h4>
        ${renderAdminAuditTrail({ reviewAudit: material.reviewAudit })}
      </section>
    </article>`)
    .join("");
}

function renderAdminVerificationTable(verifications) {
  return renderAdminTable({
    caption: "Verification material queue table",
    headers: ["Material", "School", "Experience year", "Status", "Backend material", "Detail"],
    emptyText: "No verification materials match this review queue.",
    rows: verifications.map(({ material, experience }) => `<tr>
      <th scope="row">${escapeHtml(material.materialType)}</th>
      <td>${escapeHtml(experience.school?.name ?? "Submitted experience")}</td>
      <td>${escapeHtml(experience.year)}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(material.status))}</span></td>
      <td>${escapeHtml(material.storageKeyPresent ? "Raw material backend-only" : "Metadata only")}</td>
      <td><a class="text-link" href="#admin-verification-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminVerificationDetailPanel(verifications) {
  const review = verifications[0];

  if (!review) {
    return renderAdminPanel({
      id: "admin-verification-detail",
      title: "Verification review detail",
      kicker: "Select a material after records are available.",
      sections: [
        renderAdminPanelSection("Student-side verification label preview", `<p class="inline-empty">No verification material selected.</p>`)
      ]
    });
  }

  const { material, experience, moderation } = review;

  return renderAdminPanel({
    id: "admin-verification-detail",
    title: "Verification review detail",
    kicker: `${material.materialType} - ${experience.school?.name ?? "Submitted experience"}`,
    sections: [
      renderAdminPanelSection("Student-side verification label preview", renderDetailRows([
        { label: "Public label only", value: material.status === "verified" ? "Verified" : "Verification pending" },
        { label: "Student material visibility", value: "Raw materials are never shown on student pages" }
      ])),
      renderAdminPanelSection("Backend-only material preview", renderDetailRows([
        { label: "Material id", value: material.id },
        { label: "Experience id", value: material.experienceId },
        { label: "Raw material", value: material.storageKeyPresent ? "Reviewer-only private storage reference present" : "No private storage reference" },
        { label: "Metadata", value: Object.keys(material.metadata).length > 0 ? JSON.stringify(material.metadata) : missingOfficialText }
      ])),
      renderAdminPanelSection("Associated experience", renderAdminExperienceStudentPreview(experience)),
      renderAdminPanelSection("Privacy warning results", renderAdminModerationWarnings(moderation)),
      renderAdminPanelSection("Verification audit", renderAdminAuditTrail({ reviewAudit: material.reviewAudit }))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Reason required when refusing verification</span>
        <textarea rows="2" required placeholder="Explain why the verification material is rejected or returned."></textarea>
      </label>
      ${renderAdminVerificationActions(material)}`
  });
}

export function renderAdminVerificationReviewPage({ verifications, filters = {}, user }) {
  return renderAdminShell({
    title: `Verification Review | ${productName}`,
    currentKey: "verifications",
    eyebrow: "Verification review",
    heading: "Verification material queue",
    description: "Review verification material metadata and privacy warnings without exposing raw material URLs to student pages.",
    user,
    content: `
      <section class="admin-section" aria-label="Verification filters">
        ${renderAdminVerificationFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-verification-results-title">
        <div class="section-heading">
          <h2 id="admin-verification-results-title">${escapeHtml(verifications.length)} ${escapeHtml(pluralize(verifications.length, "material"))} in verification review</h2>
          <p class="section-kicker">Student routes only receive material count and status</p>
        </div>
        ${renderAdminVerificationTable(verifications)}
      </section>`,
    detailPanel: renderAdminVerificationDetailPanel(verifications)
  });
}

function renderAdminReportFilters(filters = {}) {
  const statusOptions = [
    renderOption("pending", "Pending", filters.status ?? "pending"),
    renderOption("resolved", "Resolved", filters.status)
  ].join("");
  const targetOptions = [
    renderOption("", "Any target", filters.targetType ?? ""),
    renderOption("experience", "Experience", filters.targetType),
    renderOption("user", "User", filters.targetType)
  ].join("");

  return `<form class="filter-panel admin-filter-panel" method="get" action="/admin/reports" aria-label="Report review filters">
    <label class="filter-field">
      <span>Status</span>
      <select name="status">${statusOptions}</select>
    </label>
    <label class="filter-field">
      <span>Target type</span>
      <select name="targetType">${targetOptions}</select>
    </label>
    <div class="filter-actions">
      <button class="primary-action" type="submit">Apply</button>
      <a class="secondary-action" href="/admin/reports">Reset</a>
    </div>
  </form>`;
}

function renderAdminReportActions(report) {
  const encodedId = escapeHtml(encodeURIComponent(report.id));
  const actions = [
    { action: "keep", label: "Keep target", className: "secondary-action" },
    { action: "hide", label: "Hide target", className: "secondary-action" },
    { action: "delete", label: "Delete target", className: "secondary-action" },
    { action: "limit_account", label: "Limit account", className: "primary-action" },
    { action: "reject", label: "Reject report", className: "secondary-action" }
  ];

  return `<div class="admin-action-row" aria-label="Report resolution actions">${actions
    .map((item) => `<form method="post" action="/admin/reports/${encodedId}/resolve">
      <input type="hidden" name="action" value="${escapeHtml(item.action)}">
      <input type="hidden" name="resolutionNote" value="${escapeHtml(item.label)} after report review">
      <button class="${escapeHtml(item.className)}" type="submit">${escapeHtml(item.label)}</button>
    </form>`)
    .join("")}</div>`;
}

function renderReportTargetSummary(report) {
  if (report.targetType === "experience") {
    const experience = report.target.experience;
    return experience
      ? `${experience.school?.name ?? "Published experience"} - ${experience.summary}`
      : "Experience is no longer student-visible";
  }

  return report.target.user
    ? `${report.target.user.nickname} (${report.target.user.accountStatus})`
    : "User is no longer available";
}

function renderAdminReportCards(reports) {
  if (reports.length === 0) {
    return `<p class="empty-state">No reports match this queue.</p>`;
  }

  return reports
    .map((report) => `<article class="admin-review-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(humanizeToken(report.targetType))}</span>
        <span class="soft-badge">${escapeHtml(humanizeToken(report.status))}</span>
        <span class="muted-badge">${escapeHtml(formatDate(report.createdAt))}</span>
      </div>
      <div class="section-heading">
        <div>
          <h3>${escapeHtml(report.reason)}</h3>
          <p class="section-kicker">${escapeHtml(renderReportTargetSummary(report))}</p>
        </div>
        ${renderAdminReportActions(report)}
      </div>
      <div class="admin-review-columns">
        <section class="admin-review-section" aria-label="Report details">
          <h4>Report details</h4>
          ${renderDetailRows([
            { label: "Report id", value: report.id },
            { label: "Target id", value: report.targetId },
            { label: "Description", value: displayValue(report.description) }
          ])}
        </section>
        <section class="admin-review-section" aria-label="Resolution">
          <h4>Resolution</h4>
          ${report.resolution
            ? renderDetailRows([
                { label: "Action", value: humanizeToken(report.resolution.action) },
                { label: "Note", value: report.resolution.note },
                { label: "Operator", value: report.resolution.operatorNickname },
                { label: "Resolved", value: formatDate(report.resolution.resolvedAt) }
              ])
            : `<p class="inline-empty">No resolution recorded.</p>`}
        </section>
      </div>
    </article>`)
    .join("");
}

function renderAdminReportTable(reports) {
  return renderAdminTable({
    caption: "Report handling list table",
    headers: ["Reason", "Target", "Status", "Created", "History", "Detail"],
    emptyText: "No reports match this queue.",
    rows: reports.map((report) => `<tr>
      <th scope="row">${escapeHtml(report.reason)}</th>
      <td>${escapeHtml(humanizeToken(report.targetType))}</td>
      <td><span class="soft-badge">${escapeHtml(humanizeToken(report.status))}</span></td>
      <td>${escapeHtml(formatDate(report.createdAt))}</td>
      <td>${escapeHtml(report.resolution ? `${humanizeToken(report.resolution.action)} by ${report.resolution.operatorNickname}` : "No resolution recorded")}</td>
      <td><a class="text-link" href="#admin-report-detail">Open detail drawer</a></td>
    </tr>`)
  });
}

function renderAdminReportHistory(report) {
  if (!report.resolution) {
    return `<p class="inline-empty">No resolution recorded.</p>`;
  }

  return renderDetailRows([
    { label: "Action", value: humanizeToken(report.resolution.action) },
    { label: "Note", value: report.resolution.note },
    { label: "Operator", value: report.resolution.operatorNickname },
    { label: "Operation time", value: formatDate(report.resolution.resolvedAt) }
  ]);
}

function renderAdminReportDetailPanel(reports) {
  const report = reports[0];

  if (!report) {
    return renderAdminPanel({
      id: "admin-report-detail",
      title: "Report handling detail",
      kicker: "Select a report after records are available.",
      sections: [
        renderAdminPanelSection("Target preview", `<p class="inline-empty">No report selected.</p>`)
      ]
    });
  }

  return renderAdminPanel({
    id: "admin-report-detail",
    title: "Report handling detail",
    kicker: `${humanizeToken(report.targetType)} report - ${humanizeToken(report.status)}`,
    sections: [
      renderAdminPanelSection("Target preview", renderDetailRows([
        { label: "Target summary", value: renderReportTargetSummary(report) },
        { label: "Target id", value: report.targetId },
        { label: "Target visibility", value: report.target?.visible ? "Currently visible" : "Not student-visible" }
      ])),
      renderAdminPanelSection("Report reason", renderDetailRows([
        { label: "Reason", value: report.reason },
        { label: "Description", value: displayValue(report.description) },
        { label: "Created", value: formatDate(report.createdAt) }
      ])),
      renderAdminPanelSection("History and operator record", renderAdminReportHistory(report))
    ],
    actions: `<label class="form-field admin-reason-field">
        <span>Resolution reason</span>
        <textarea rows="2" required placeholder="Record why the report is kept, rejected, hidden, deleted, or account-limited."></textarea>
      </label>
      ${renderAdminReportActions(report)}`
  });
}

export function renderAdminReportReviewPage({ reports, filters = {}, user }) {
  return renderAdminShell({
    title: `Report Review | ${productName}`,
    currentKey: "reports",
    eyebrow: "Report handling",
    heading: "Report resolution queue",
    description: "Resolve reports by keeping, rejecting, hiding, deleting, or limiting the target account with an audited note.",
    user,
    content: `
      <section class="admin-section" aria-label="Report filters">
        ${renderAdminReportFilters(filters)}
      </section>
      <section class="admin-section" aria-labelledby="admin-report-results-title">
        <div class="section-heading">
          <h2 id="admin-report-results-title">${escapeHtml(reports.length)} ${escapeHtml(pluralize(reports.length, "report"))} awaiting handling</h2>
          <p class="section-kicker">Resolution notes are required for every report action</p>
        </div>
        ${renderAdminReportTable(reports)}
      </section>`,
    detailPanel: renderAdminReportDetailPanel(reports)
  });
}

function renderPersonalSummary(personalCenter) {
  const items = [
    {
      label: "昵称",
      value: personalCenter.user.nickname,
      detail: gradeLabel(personalCenter.user.grade)
    },
    {
      label: "默认匿名偏好",
      value: personalCenter.preferences.defaultAnonymous ? "默认匿名" : "默认展示昵称",
      detail: "用于新的面经投稿"
    },
    {
      label: "院校收藏",
      value: personalCenter.favorites.schools.length,
      detail: "已收藏院校"
    },
    {
      label: "面经收藏",
      value: personalCenter.favorites.experiences.length,
      detail: "已收藏面经"
    },
    {
      label: "投稿",
      value: personalCenter.submittedExperiences.length,
      detail: "审核状态跟踪"
    },
    {
      label: "站内提醒",
      value: personalCenter.notifications.length,
      detail: "仅个人中心展示"
    }
  ];

  return `<div class="personal-summary">${items
    .map((item) => `<div class="status-item">
      <span class="status-label">${escapeHtml(item.label)}</span>
      <strong class="status-value">${escapeHtml(item.value)}</strong>
      <span class="status-note">${escapeHtml(item.detail)}</span>
    </div>`)
    .join("")}</div>`;
}

function renderFavoriteSchoolCards(favorites) {
  if (favorites.length === 0) {
    return `<p class="empty-state">还没有收藏院校。</p>`;
  }

  return favorites
    .map((favorite) => {
      const school = favorite.school;
      const guide = favorite.guide;
      const schoolHref = school
        ? `/schools/${escapeHtml(encodeURIComponent(school.id))}${guide ? `?year=${escapeHtml(guide.year)}` : ""}`
        : "/schools";

      return `<article class="personal-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(guide?.year ?? "院校")}</span>
          <span class="soft-badge">${escapeHtml(humanizeToken(favorite.visibility))}</span>
        </div>
        <h3><a href="${schoolHref}">${escapeHtml(school?.name ?? "不可用院校")}</a></h3>
        ${renderDetailRows([
          { label: "城市", value: displayValue(school?.city) },
          { label: "院校类型", value: school ? humanizeToken(school.schoolType) : missingOfficialText },
          { label: "报名状态", value: guide ? humanizeToken(guide.applicationStatus) : missingOfficialText },
          { label: "报名截止", value: guide ? formatDate(guide.applicationDeadlineAt) : missingOfficialText }
        ])}
      </article>`;
    })
    .join("");
}

function renderFavoriteExperienceCards(favorites) {
  if (favorites.length === 0) {
    return `<p class="empty-state">还没有收藏面经。</p>`;
  }

  return favorites
    .map((favorite) => {
      const experience = favorite.experience;
      const school = experience?.school;

      return `<article class="personal-card">
        <div class="badge-row">
          <span class="badge">${escapeHtml(experience?.year ?? "面经")}</span>
          <span class="soft-badge">${escapeHtml(experience?.verifiedLabel ?? humanizeToken(favorite.visibility))}</span>
        </div>
        <h3>${escapeHtml(school?.name ?? "不可用面经")}</h3>
        <p>${escapeHtml(experience?.summary ?? "这条面经已不再对学生端可见。")}</p>
        ${renderDetailRows([
          { label: "阶段", value: experience ? experience.stageLabel : missingOfficialText },
          { label: "考核形式", value: experience ? experience.assessmentFormat : missingOfficialText },
          { label: "有用数", value: experience ? experience.usefulCount : missingOfficialText }
        ])}
      </article>`;
    })
    .join("");
}

function renderNotificationCards(notifications) {
  if (notifications.length === 0) {
    return `<p class="empty-state">当前没有收藏院校或投稿相关站内提醒。</p>`;
  }

  return notifications
    .map((notification) => {
      if (notification.type === "submission_review") {
        return `<article class="personal-card">
      <div class="badge-row">
        <span class="site-badge">仅站内</span>
        <span class="status-badge status-${escapeHtml(notification.status)}">${escapeHtml(notification.statusLabel)}</span>
      </div>
      <h3>${escapeHtml(notification.title)}</h3>
      ${renderDetailRows([
        { label: "院校", value: notification.school?.name ?? "已发布院校" },
        { label: "投稿年份", value: notification.year },
        { label: "下一步", value: notification.nextAction?.label ?? "查看已投稿面经分组。" }
      ])}
    </article>`;
      }

      return `<article class="personal-card">
      <div class="badge-row">
        <span class="site-badge">仅站内</span>
        <span class="status-badge status-${escapeHtml(notification.status)}">${escapeHtml(notification.statusLabel)}</span>
      </div>
      <h3>${escapeHtml(notification.title)}</h3>
      ${renderDetailRows([
        { label: "院校", value: notification.school?.name ?? "已发布院校" },
        { label: "时间线节点", value: humanizeToken(notification.eventKey) },
        { label: "到期", value: formatDate(notification.dueAt) }
      ])}
    </article>`;
    })
    .join("");
}

function renderSubmissionAction(action) {
  if (!action?.label) {
    return missingOfficialText;
  }

  if (action.href) {
    return `<a class="text-link" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a>`;
  }

  return escapeHtml(action.label);
}

function renderSubmittedExperienceCard(experience) {
  return `<article class="personal-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(experience.year)}</span>
        <span class="soft-badge">${escapeHtml(experience.statusLabel)}</span>
        <span class="muted-badge">${escapeHtml(experience.verification.statusLabel)}</span>
      </div>
      <h3>${escapeHtml(experience.school?.name ?? "已发布院校")}</h3>
      <p>${escapeHtml(experience.summary)}</p>
      ${renderDetailRows([
        { label: "阶段", value: humanizeToken(experience.stage) },
        { label: "考核形式", value: experience.assessmentTypes.map(humanizeToken).join("、") },
        { label: "审核状态", value: experience.statusLabel },
        { label: "展示身份", value: experience.author.displayName ?? experience.author.nickname },
        { label: "下一步", html: renderSubmissionAction(experience.nextAction) }
      ])}
    </article>`;
}

function renderSubmittedExperienceGroups(personalCenter) {
  const experiences = personalCenter.submittedExperiences;

  if (experiences.length === 0) {
    return `<p class="empty-state">还没有提交面经。</p>`;
  }

  const groups = Array.isArray(personalCenter.submittedExperienceGroups) && personalCenter.submittedExperienceGroups.length > 0
    ? personalCenter.submittedExperienceGroups
    : [
        {
          key: "submitted",
          label: "已提交",
          nextAction: "查看最新审核状态。",
          experiences: personalCenter.submittedExperiences
        }
      ];

  return groups
    .map((group) => `<section class="submission-group" aria-labelledby="submission-group-${escapeHtml(group.key)}">
      <div class="submission-group-heading">
        <div>
          <h3 id="submission-group-${escapeHtml(group.key)}">${escapeHtml(group.label)}</h3>
          <p>${escapeHtml(group.nextAction)}</p>
        </div>
        <span class="muted-badge">${escapeHtml(group.experiences.length)} 项</span>
      </div>
      <div class="personal-list">${group.experiences.map(renderSubmittedExperienceCard).join("")}</div>
    </section>`)
    .join("");
}

function renderPreferenceForm(personalCenter, feedback) {
  const preferences = personalCenter.preferences;
  const gradeOptions = Object.entries(gradeLabels)
    .map(([value, label]) => renderOption(value, label, preferences.grade))
    .join("");
  const anonymousOptions = [
    renderOption("true", "默认匿名", preferences.defaultAnonymous ? "true" : "false"),
    renderOption("false", "默认展示昵称", preferences.defaultAnonymous ? "true" : "false")
  ].join("");

  return `<div class="preference-stack">
  <form class="preference-form" method="post" action="/me/preferences" aria-label="账号偏好">
    ${renderPersonalFeedback(feedback)}
    <label class="form-field">
      <span>昵称</span>
      <input name="nickname" value="${escapeHtml(preferences.nickname)}" autocomplete="nickname" required>
    </label>
    <label class="form-field">
      <span>年级</span>
      <select name="grade" required>${gradeOptions}</select>
    </label>
    <label class="form-field">
      <span>默认匿名偏好</span>
      <select name="defaultAnonymous" required>${anonymousOptions}</select>
    </label>
    <div class="form-actions">
      <button class="primary-action" type="submit">更新偏好</button>
    </div>
  </form>
  <form class="preference-form logout-form" method="post" action="/logout" aria-label="退出登录">
    <input type="hidden" name="returnTo" value="/me">
    <button class="secondary-action" type="submit" data-clear-experience-drafts="true">退出登录</button>
  </form>
  </div>`;
}

export function renderPersonalCenterLoginGuidePage({ returnTo = "/me" } = {}) {
  return renderStudentPage({
    title: `我的 | ${productName}`,
    currentKey: "me",
    topBar: renderStudentTopBar({
      type: "list",
      title: "我的"
    }),
    content: `
      <section class="page-heading" aria-labelledby="personal-login-title">
        <p class="eyebrow">个人中心</p>
        <h1 id="personal-login-title">我的</h1>
        <p class="lead">登录后可以集中管理收藏、投稿、站内提醒和账号偏好。</p>
      </section>

      <section class="section" aria-label="登录引导">
        <article class="personal-login-guide">
          <div class="login-heading">
            <p class="eyebrow">登录引导</p>
            <h2>登录后使用我的页面</h2>
            <p>登录后可使用院校收藏、面经发布和审核状态跟踪。</p>
          </div>
          <div class="form-actions">
            <a class="primary-action" href="/login?returnTo=${escapeHtml(encodeURIComponent(safeReturnHref(returnTo)))}">登录</a>
          </div>
          <ul class="tip-list">
            <li>收藏广东综评院校，生成个人时间线。</li>
            <li>审核通过后发布结构化面经。</li>
            <li>在本页查看已投稿面经的审核状态。</li>
          </ul>
        </article>
      </section>`
  });
}

export function renderPersonalCenterPage({ personalCenter, notice = "", error = "" }) {
  return renderStudentPage({
    title: `个人中心 | ${productName}`,
    currentKey: "me",
    topBar: renderStudentTopBar({
      type: "list",
      title: "我的"
    }),
    content: `
      <section class="page-heading" aria-labelledby="personal-center-title">
        <p class="eyebrow">已登录工作区</p>
        <h1 id="personal-center-title">个人中心</h1>
        <p class="lead">查看已收藏招生内容、已提交面经、站内提醒和账号偏好。</p>
      </section>

      <section class="section" aria-label="个人摘要">
        ${renderPersonalSummary(personalCenter)}
      </section>

      <section class="section personal-grid" aria-label="个人中心内容">
        <div class="personal-panel">
          <div class="section-heading">
            <h2>站内提醒</h2>
            <p class="section-kicker">${escapeHtml(personalCenter.notifications.length)} 个站内提醒</p>
          </div>
          <div class="personal-list">${renderNotificationCards(personalCenter.notifications)}</div>
        </div>

        <div class="personal-panel">
          <div class="section-heading">
            <h2>账号偏好</h2>
            <p class="section-kicker">${escapeHtml(gradeLabel(personalCenter.preferences.grade))}</p>
          </div>
          ${renderPreferenceForm(personalCenter, { notice, error })}
        </div>
      </section>

      <section class="section personal-grid" aria-label="收藏与投稿">
        <div class="personal-panel">
          <div class="section-heading">
            <h2>收藏院校</h2>
            <p class="section-kicker">${escapeHtml(personalCenter.favorites.schools.length)} 所已收藏院校</p>
          </div>
          <div class="personal-list">${renderFavoriteSchoolCards(personalCenter.favorites.schools)}</div>
        </div>

        <div class="personal-panel">
          <div class="section-heading">
            <h2>收藏面经</h2>
            <p class="section-kicker">${escapeHtml(personalCenter.favorites.experiences.length)} 条已收藏面经</p>
          </div>
          <div class="personal-list">${renderFavoriteExperienceCards(personalCenter.favorites.experiences)}</div>
        </div>
      </section>

      <section class="section" aria-labelledby="submitted-experiences-title">
        <div class="section-heading">
          <h2 id="submitted-experiences-title">已提交面经</h2>
          <p class="section-kicker">${escapeHtml(personalCenter.submittedExperiences.length)} 条本人投稿</p>
        </div>
        <div class="personal-list submitted-list">${renderSubmittedExperienceGroups(personalCenter)}</div>
      </section>`
  });
}

const homeTaskEntries = Object.freeze([
  {
    title: "院校",
    label: "查院校",
    href: "/schools",
    icon: "school"
  },
  {
    title: "时间线",
    label: "看日期",
    href: "/timeline",
    icon: "calendar"
  },
  {
    title: "综合分",
    label: "算分数",
    href: "/calculator",
    icon: "calculator"
  },
  {
    title: "面经",
    label: "看经验",
    href: "/experiences",
    icon: "experience"
  }
]);

const gradePreparationTips = Object.freeze({
  high_school_g1: [
    "了解综评整体路径。",
    "关注选科要求和可报院校范围。",
    "开始保存可用于材料准备的经历案例。"
  ],
  high_school_g2: [
    "核对学考和选科要求。",
    "比较目标院校近年简章变化。",
    "提前跟踪校测形式和准备节奏。"
  ],
  high_school_g3: [
    "关注当年简章发布。",
    "留意报名截止、确认和缴费时间。",
    "准备校测可用的经历和案例。"
  ],
  graduated: [
    "以当年已发布简章作为官方参考。",
    "行动前核对院校年度变化。",
    "按年份和阶段阅读面经。"
  ]
});

function normalizeHomeGrade(grade) {
  return Object.hasOwn(gradeLabels, grade) ? grade : "high_school_g3";
}

function homeReferenceDate(now) {
  if (typeof now !== "function") {
    return new Date();
  }

  const value = now();
  return value instanceof Date ? value : new Date(value);
}

function renderHomeTasks() {
  return homeTaskEntries
    .map((entry) => `<a class="home-task-card" href="${escapeHtml(entry.href)}">
      <span class="home-task-icon">${renderIcon(entry.icon)}</span>
      <strong>${escapeHtml(entry.title)}</strong>
      <span>${escapeHtml(entry.label)}</span>
    </a>`)
    .join("");
}

function nearestHomeTimelineNodes({ user, interactionStore, year, now, nodesOverride = null }) {
  if (Array.isArray(nodesOverride)) {
    return {
      favoriteScoped: false,
      nodes: nearestImportantEvents(nodesOverride, homeReferenceDate(now))
    };
  }

  const favoriteSchoolIds = user && typeof interactionStore?.listFavoriteSchoolIds === "function"
    ? interactionStore.listFavoriteSchoolIds(user.id)
    : [];
  const favoriteScoped = favoriteSchoolIds.length > 0;
  const nodes = listTimelineNodes({
    year,
    schoolIds: favoriteScoped ? favoriteSchoolIds : [],
    referenceDate: homeReferenceDate(now)
  });

  return {
    favoriteScoped,
    nodes: nearestImportantEvents(nodes, homeReferenceDate(now))
  };
}

function renderHomeTimelineRows(nodes) {
  if (nodes.length === 0) {
    return `<p class="empty-state">暂无明确时间线节点，发布后会更新。</p>`;
  }

  return nodes
    .slice(0, 3)
    .map((node) => {
      const school = node.school ?? getSchoolById(node.schoolId);

      return `<article class="home-list-row" data-home-timeline-row="true">
        <div>
          <span class="row-label">${escapeHtml(school?.name ?? "已发布院校")}</span>
          <strong>${escapeHtml(node.title)}</strong>
        </div>
        <div class="row-side">
          <span>${escapeHtml(formatTimelineWindow(node))}</span>
          <em>${escapeHtml(humanizeToken(node.status ?? "not_started"))}</em>
        </div>
      </article>`;
    })
    .join("");
}

function renderHomeGuideRows(guides) {
  if (guides.length === 0) {
    return `<p class="empty-state">当年简章暂未发布，可先参考往年官方规则。</p>`;
  }

  return guides
    .slice(0, 3)
    .map((guide) => `<a class="home-list-row" href="/schools/${escapeHtml(encodeURIComponent(guide.schoolId))}?year=${escapeHtml(guide.admissionYear)}" data-home-guide-row="true">
      <div>
        <span class="row-label">${escapeHtml(schoolNameFor(guide))}</span>
        <strong>${escapeHtml(guide.admissionYear)} ${escapeHtml(humanizeToken(guide.status))}</strong>
      </div>
      <div class="row-side">
        <span>截止 ${escapeHtml(formatDate(guide.applicationDeadlineAt))}</span>
        <em>${escapeHtml(humanizeToken(guide.sourceType ?? "official_source"))}</em>
      </div>
    </a>`)
    .join("");
}

function renderHomeExperienceRows(experiences) {
  if (experiences.length === 0) {
    return `<p class="empty-state">暂无已发布面经，可先查看院校简章。</p>`;
  }

  return experiences
    .slice(0, 3)
    .map((experience) => {
      const school = getSchoolById(experience.schoolId);
      const assessmentFormat = experience.assessmentTypes.map(humanizeToken).join("、");

      return `<a class="home-list-row" href="/schools/${escapeHtml(encodeURIComponent(experience.schoolId))}?year=${escapeHtml(experience.admissionYear)}" data-home-experience-row="true">
        <div>
          <span class="row-label">${escapeHtml(school?.name ?? "已发布院校")}</span>
          <strong>${escapeHtml(experience.admissionYear)} ${escapeHtml(humanizeToken(experience.stage))}</strong>
        </div>
        <div class="row-side">
          <span>${escapeHtml(assessmentFormat)}</span>
          <em>${escapeHtml(experienceVerifiedLabel(experience))}</em>
        </div>
      </a>`;
    })
    .join("");
}

function renderGradeTips(grade) {
  return gradePreparationTips[grade]
    .map((tip) => `<li>${escapeHtml(tip)}</li>`)
    .join("");
}

export function renderStudentHome({
  user = null,
  interactionStore = null,
  now,
  grade,
  homeData = {}
} = {}) {
  const guides = Array.isArray(homeData.guides) ? homeData.guides : listGuides();
  const currentYear = currentAdmissionYear(guides);
  const selectedGrade = normalizeHomeGrade(grade ?? user?.grade);
  const timeline = nearestHomeTimelineNodes({
    user,
    interactionStore,
    year: currentYear,
    now,
    nodesOverride: homeData.timelineNodes
  });
  const latestGuides = guides.slice(0, 3);
  const latestExperiences = (
    Array.isArray(homeData.experiences) ? homeData.experiences : listExperiences({ sort: "newest" })
  ).slice(0, 3);
  const timelineSource = timeline.favoriteScoped ? "已收藏院校" : "全站已发布节点";
  const guestPrompt = !user
    ? `<p class="login-prompt">登录后可收藏院校并查看个人时间线。</p>`
    : "";

  return renderStudentPage({
    title: productName,
    currentKey: "home",
    topBar: renderStudentTopBar({
      type: "home",
      title: productName,
      actionHtml: renderGradeSwitch(selectedGrade)
    }),
    content: `
      <section class="home-first-screen" aria-labelledby="home-title">
        <article class="home-greeting-card">
          <p class="eyebrow">${escapeHtml(gradeLabel(selectedGrade))}</p>
          <h1 id="home-title">广东综合评价招生</h1>
          <p>按年级快速查看院校、时间节点、综合分工具和结构化面经。</p>
        </article>

        <nav class="home-task-grid" aria-label="核心任务">
          ${renderHomeTasks()}
        </nav>

        <section class="home-panel" aria-labelledby="nearest-nodes-title">
          <div class="section-heading">
            <h2 id="nearest-nodes-title">最近时间节点</h2>
            <p class="section-kicker">${escapeHtml(timelineSource)}</p>
          </div>
          <div class="home-list">${renderHomeTimelineRows(timeline.nodes)}</div>
          ${guestPrompt}
        </section>
      </section>

      <section class="section home-panel" aria-labelledby="latest-guides-title">
        <div class="section-heading">
          <h2 id="latest-guides-title">最新简章</h2>
          <a class="text-link" href="/schools">全部院校</a>
        </div>
        <div class="home-list">${renderHomeGuideRows(latestGuides)}</div>
      </section>

      <section class="section home-panel" aria-labelledby="latest-experiences-title">
        <div class="section-heading">
          <h2 id="latest-experiences-title">最新面经</h2>
          <a class="text-link" href="/experiences">全部面经</a>
        </div>
        <div class="home-list">${renderHomeExperienceRows(latestExperiences)}</div>
      </section>

      <section class="section home-panel" aria-labelledby="grade-tips-title">
        <div class="section-heading">
          <h2 id="grade-tips-title">年级准备建议</h2>
          <p class="section-kicker">${escapeHtml(gradeLabel(selectedGrade))}</p>
        </div>
        <ul class="tip-list">${renderGradeTips(selectedGrade)}</ul>
      </section>
`
  });
}

function safeReturnHref(returnTo) {
  return typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//")
    ? returnTo
    : "/";
}

export function renderLoginPage({
  returnTo = "/",
  pendingAction = "",
  phoneNumber = "",
  otpCode = "",
  agreement = false,
  error = "",
  notice = ""
} = {}) {
  const checked = agreement ? " checked" : "";
  const disabled = agreement ? "" : " disabled";

  return renderStudentPage({
    title: `登录 | ${productName}`,
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "form",
      title: "登录",
      backHref: safeReturnHref(returnTo),
      backLabel: "返回"
    }),
    content: `
      <section class="login-card" aria-labelledby="login-title">
        <div class="login-heading">
          <p class="eyebrow">手机号验证码</p>
          <h1 id="login-title">登录广东综评</h1>
          <p>登录后可收藏院校、发布面经并跟踪审核状态。</p>
        </div>

        ${notice ? `<p class="form-success" role="status">${escapeHtml(notice)}</p>` : ""}
        ${error ? `<p class="form-error" role="alert">${escapeHtml(error)}</p>` : ""}

        <form class="login-form" method="post" action="/login" data-login-form="true" aria-label="手机号验证码登录">
          <input type="hidden" name="returnTo" value="${escapeHtml(safeReturnHref(returnTo))}">
          <input type="hidden" name="pendingAction" value="${escapeHtml(pendingAction)}">

          <label class="form-field">
            <span>中国大陆手机号</span>
            <input
              name="phoneNumber"
              type="tel"
              inputmode="numeric"
              autocomplete="tel"
              placeholder="13812345678"
              pattern="^(?:\\+?86)?1[3-9]\\d{9}$"
              value="${escapeHtml(phoneNumber)}"
              required>
          </label>

          <label class="form-field">
            <span>验证码</span>
            <div class="otp-row">
              <input
                name="otpCode"
                inputmode="numeric"
                autocomplete="one-time-code"
                value="${escapeHtml(otpCode)}"
                required>
              <button class="secondary-action otp-send-button" type="button" data-send-otp="true">发送验证码</button>
            </div>
          </label>

          <p class="login-inline-error" role="alert" aria-live="polite" data-login-error="true"></p>

          <label class="checkbox-field login-agreement">
            <input type="checkbox" name="agreement" value="accepted"${checked} data-login-agreement="true">
            <span>我同意用户协议和隐私政策。</span>
          </label>

          <div class="form-actions">
            <button class="primary-action" type="submit" data-login-submit="true"${disabled}>登录</button>
          </div>
        </form>
      </section>
      <script src="/login.js" defer></script>
`
  });
}

export function renderAdminPage({ user } = {}) {
  const workflowItems = workflowPlaceholders
    .map(
      (item) => `<article class="admin-overview-card">
        <strong>${item.title}</strong>
        <span>${item.status}</span>
      </article>`
    )
    .join("");

  return renderAdminShell({
    title: `管理后台 | ${productName}`,
    currentKey: "overview",
    eyebrow: "审计工作流基础",
    heading: "管理后台",
    description: "MVP 管理区用于已审核官方数据、结构化抽取任务、面经审核和举报处理。",
    user,
    content: `
      <section class="admin-section" aria-labelledby="admin-routes-title">
        <div class="section-heading">
          <h2 id="admin-routes-title">桌面工作流总览</h2>
          <p class="section-kicker">所有管理流程使用左侧导航、全局状态栏、表格和右侧审核面板。</p>
        </div>
        <div class="admin-overview-grid">${workflowItems}</div>
      </section>`,
    detailPanel: renderAdminPanel({
      id: "admin-overview-detail",
      title: "审核工作流规则",
      kicker: "学生端可见变更必须保留审计记录。",
      sections: [
        renderAdminPanelSection("学生端预览", `<p class="section-kicker">官方简章、公式、面经、认证和举报动作在发布或隐藏前展示学生端可见内容。</p>`),
        renderAdminPanelSection("审计要求", `<p class="section-kicker">发布、退回、隐藏、删除、拒绝和限制账号操作必须记录操作人和操作时间。</p>`)
      ]
    })
  });
}

export function renderNotFound() {
  return renderStudentPage({
    title: `页面不存在 | ${productName}`,
    hideBottomNav: true,
    topBar: renderStudentTopBar({
      type: "detail",
      title: "页面不存在",
      backHref: "/",
      backLabel: "返回首页"
    }),
    content: `
      <section class="hero-copy">
        <p class="eyebrow">404</p>
        <h1>页面不存在</h1>
        <p class="lead">当前页面不存在或暂未开放。</p>
        <div class="actions"><a class="primary-action" href="/">返回首页</a></div>
      </section>`
  });
}
