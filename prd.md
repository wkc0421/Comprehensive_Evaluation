# 广东综评 MVP PRD 与架构方案

版本：v0.1  
日期：2026-06-01  
产品形态：移动优先 Web  
目标用户：广东高一、高二、高三学生  

## 1. 产品概述

广东综评 MVP 是一个面向广东高中生的综合评价招生信息与经验平台，首版聚焦四个能力：

1. 广东综评简章库
2. 个人关注时间线
3. 综合分计算器
4. 结构化面经社区

平台不做录取概率预测，不做泛高考论坛，不做开放评论，不做微信/短信提醒，不自动发布未经人工审核的官方信息。

## 2. 产品目标

### 2.1 核心目标

- 让学生快速查清广东综评有哪些学校、每所学校怎么报名、什么时候截止、如何计算综合分。
- 将官方简章、招生规则、时间节点结构化，降低学生和家长反复查官网、看长 PDF 的成本。
- 通过结构化面经投稿，尽早积累学校维度、年份维度、校测形式维度的真实备考经验。
- 通过 AI 检索和字段抽取提高运营录入效率，但所有官方数据必须人工审核后发布。

### 2.2 成功指标

- 2024-2026 年广东综评院校简章覆盖率达到 95% 以上。
- 每条已发布简章均包含官方来源链接、年份、学校、关键时间节点和录取规则摘要。
- 学生能在 3 步内完成一次综合分计算：选择学校与年份、输入分数、查看结果。
- 每条面经均具备学校、年份、阶段、校测形式等结构化字段。
- 未登录用户可以完成信息查询；登录用户可以完成收藏、投稿、点有用、举报。

## 3. 范围定义

### 3.1 MVP 包含

- 广东综评院校与简章数据库，首批覆盖 2024、2025、2026 年。
- 院校详情页，展示官方简章、报名入口、时间线、成绩公式、面经。
- 时间线页，支持用户收藏学校后生成个人关注节点。
- 综合分计算器，支持不同学校、不同年份的公式配置。
- 面经社区，支持结构化投稿、匿名展示、收藏、有用、举报、可选认证。
- 管理端，支持官方资料 AI 检索抽取、人工审核发布、面经审核、认证审核、举报处理。

### 3.2 MVP 不包含

- 不做录取概率预测、录取排名预测或志愿填报决策建议。
- 不做开放评论区和私信。
- 不做微信小程序、App、短信提醒、微信服务号提醒。
- 不做支付、课程售卖、志愿填报付费咨询。
- 不自动发布 AI 抽取结果。
- 不展示或售卖未公开考试原题。

## 4. 用户与场景

### 4.1 高一学生

关注点：

- 什么是广东综评。
- 选科、学考、英语能力、活动经历对综评有什么影响。
- 哪些学校值得提前了解。

核心路径：

1. 进入首页选择或设置年级为高一。
2. 查看广东综评基础说明与院校概览。
3. 收藏感兴趣学校。
4. 阅读往年面经，形成长期准备认知。

### 4.2 高二学生

关注点：

- 学考、选科、活动材料是否满足目标学校要求。
- 目标学校近几年规则是否稳定。
- 校测通常考什么、怎么准备。

核心路径：

1. 进入院校列表筛选目标学校。
2. 查看 2024-2026 年简章变化。
3. 收藏学校并查看时间线。
4. 浏览结构化面经，了解校测形式。

### 4.3 高三学生

关注点：

- 当年简章是否发布。
- 报名什么时候截止。
- 需要准备哪些材料。
- 综合分怎么计算。
- 校测流程和经验。

核心路径：

1. 首页查看“最近截止”和“已发布简章”。
2. 进入目标院校详情页。
3. 收藏学校，跟踪个人时间线。
4. 使用综合分计算器。
5. 阅读面经并在考后投稿。

## 5. 信息架构

### 5.1 学生端页面

1. 首页
   - 年级化内容入口。
   - 广东综评年度进度。
   - 最近截止节点。
   - 最新发布简章。
   - 最新高质量面经。

2. 院校列表页
   - 筛选条件：年份、学校、简章状态、报名状态、学校类型。
   - 排序条件：报名截止时间、更新时间、学校名称。
   - 卡片信息：学校名称、年份、报名状态、关键节点、公式类型、是否有面经。

3. 院校详情页
   - 学校基础信息。
   - 当前年份简章摘要。
   - 官方链接与报名入口。
   - 时间线。
   - 成绩公式与计算入口。
   - 招生专业/大类。
   - 选科要求、学考要求、校测形式、录取规则、费用。
   - 面经列表。

4. 时间线页
   - 全部广东综评节点。
   - 我的收藏学校节点。
   - 节点状态：未开始、进行中、即将截止、已结束。
   - 节点类型：简章发布、报名开始、报名截止、初审公布、确认/缴费、校测、入围公示、志愿填报、录取公示。

5. 综合分计算器页
   - 选择学校与年份。
   - 展示公式说明和原文依据。
   - 输入分数项。
   - 输出综合分、各项贡献分、公式来源。
   - 无明确公式时不展示计算入口。

6. 面经列表页
   - 筛选条件：学校、年份、阶段、校测形式、是否认证。
   - 排序条件：最新、有用数、认证优先。
   - 内容卡片：学校、年份、阶段、形式、摘要、认证标签、有用数。

7. 发布面经页
   - 登录后可见。
   - 结构化表单投稿。
   - 支持匿名展示。
   - 支持上传可选认证材料。

8. 个人中心
   - 我的收藏学校。
   - 我的收藏面经。
   - 我的投稿。
   - 投稿审核状态。
   - 站内提醒。
   - 账号与匿名偏好。

### 5.2 管理端页面

1. 数据录入任务页
   - 创建 AI 检索/抽取任务。
   - 查看来源候选、抽取字段、置信度。
   - 进入人工校对。

2. 简章审核页
   - 草稿列表。
   - 字段对照官方原文。
   - 发布、退回、标记待补充。
   - 版本记录。

3. 时间线管理页
   - 查看从简章生成的节点。
   - 支持人工覆盖日期、标题、说明。
   - 记录覆盖原因。

4. 公式管理页
   - 配置学校年份公式。
   - 配置输入项、满分、权重、计算说明、原文依据。
   - 公式发布前必须测试样例。

5. 面经审核页
   - 待审投稿。
   - 敏感内容识别结果。
   - 通过、退回、隐藏、封禁。

6. 认证审核页
   - 查看认证类型和材料。
   - 仅管理员可访问原始材料。
   - 审核后前台只展示认证标签，不展示材料。

7. 举报处理页
   - 举报原因、被举报内容、处理状态。
   - 操作：保留、隐藏、删除、限制账号。

## 6. 功能需求

### 6.1 简章库

每条简章以“学校 + 年份 + 广东”为唯一业务维度。

必填字段：

- 学校名称
- 年份
- 简章标题
- 官方来源链接
- 来源类型：广东省教育考试院、阳光高考/学信网、高校本科招生网、其他官方来源
- 来源发布时间或来源更新时间
- 发布状态：草稿、待审核、已发布、已归档
- 报名入口
- 报名开始时间
- 报名截止时间
- 报名条件
- 学考要求
- 选科要求
- 招生专业/大类
- 校测形式
- 入围规则
- 录取规则
- 学费/住宿费
- 官方咨询方式

可选字段：

- 招生计划
- 初审公布时间
- 确认/缴费时间
- 校测时间
- 入围公示时间
- 志愿填报批次
- 备注

规则：

- 学生端只展示“已发布”简章。
- 草稿和待审核简章仅管理端可见。
- 简章字段修改后必须生成新版本。
- 关键字段缺失时可以发布，但必须展示“官方未明确/待补充”。

### 6.2 时间线

时间线优先从简章结构化字段自动生成。

节点类型：

- 简章发布
- 报名开始
- 报名截止
- 初审公布
- 考试确认/缴费
- 校测
- 入围公示
- 志愿填报
- 录取公示

规则：

- 用户未登录可查看全部时间线。
- 登录用户收藏学校后，可查看“我的时间线”。
- MVP 提醒仅做站内展示，不发送短信、微信或邮件。
- 日期不明确的节点可以展示为“待公布”，不得虚构日期。
- 人工覆盖自动生成节点时必须记录操作人和原因。

### 6.3 综合分计算器

计算器按学校和年份加载公式，不写死为统一 631。

公式能力：

- 支持固定权重公式，例如高考 60%、校测 30%、学考 10%。
- 支持非 631 公式，例如高考 85%、校考 15%。
- 支持不同输入项满分不同，系统按配置归一或直接加权。
- 支持展示公式说明和官方来源依据。

输入校验：

- 必填分数缺失时不可计算。
- 分数低于 0 或高于配置满分时不可计算。
- 学校年份没有明确公式时不展示计算入口。

输出：

- 综合分。
- 各输入项贡献分。
- 使用的公式名称。
- 公式说明。
- 官方依据链接。
- 免责声明：计算结果仅按公开公式换算，不代表录取概率。

### 6.4 结构化面经社区

面经发布必须登录，但前台可匿名展示。

投稿字段：

- 年份
- 学校
- 专业/招生大类
- 考生类型：物理类、历史类、其他
- 阶段：初审、机试、笔试、中文面试、英文面试、小组面试、录取后复盘
- 是否入围
- 是否最终录取，可选
- 校测形式，可多选
- 考试地点，可选
- 大致流程
- 问题类型，可多选：学科知识、英语表达、时事观点、专业认知、个人材料追问、综合素质、其他
- 准备方式
- 体验评分：难度、紧张程度、区分度
- 给下一届的建议
- 是否匿名展示
- 可选认证材料

展示规则：

- 审核通过后展示。
- 匿名展示时不展示手机号、真实姓名、认证材料、提交账号。
- 已认证内容展示“已认证”标签。
- 超过 2 年的面经展示“历史参考”提示。
- 学校详情页优先展示同学校、近两年、已认证或有用数高的面经。

互动规则：

- 登录用户可收藏面经。
- 登录用户可点“有用”，同一用户对同一面经只能点一次。
- 登录用户可举报。
- MVP 不开放评论和私信。

内容边界：

- 允许分享流程、题型类别、准备方法、个人感受。
- 不允许传播考试正在进行中的内容。
- 不允许展示未公开具体原题、售卖真题、代写材料、包过承诺、引流诈骗。
- 不允许展示身份证号、准考证号、手机号、真实姓名、学校班级等敏感信息。

### 6.5 账号与权限

账号体系：

- MVP 使用手机号验证码登录。
- 用户可设置昵称、年级、匿名展示偏好。
- 手机号仅用于登录、安全和风控，不在前台展示。

角色：

- 游客：浏览简章、时间线、计算器、已发布面经。
- 登录用户：收藏、投稿、点有用、举报、查看个人中心。
- 内容审核员：审核面经、认证材料、举报。
- 数据审核员：审核 AI 抽取的官方资料和公式。
- 管理员：拥有全部管理权限。

### 6.6 AI 检索与人工审核

AI 入库流程：

1. 管理员创建检索任务，输入年份、学校或关键词。
2. 系统检索官方来源候选。
3. 系统抽取简章字段、时间节点、公式候选。
4. 系统展示来源链接、抽取字段、置信度和待确认项。
5. 数据审核员对照官方原文人工校验。
6. 审核通过后发布到学生端。

规则：

- AI 结果只能生成草稿，不得自动发布。
- 官方来源优先级：广东省教育考试院 > 阳光高考/学信网 > 高校本科招生网 > 其他官方来源。
- 第三方资讯站只能作为线索，不作为最终权威来源。
- 每个发布字段必须能追溯到来源文档或人工备注。

## 7. 数据模型

### 7.1 users

- id
- phone
- nickname
- grade：高一、高二、高三、其他
- default_anonymous
- role：user、content_reviewer、data_reviewer、admin
- status：active、limited、banned
- created_at
- updated_at

### 7.2 schools

- id
- name
- short_name
- province
- city
- school_type
- official_site_url
- admission_site_url
- status：active、inactive
- created_at
- updated_at

### 7.3 admission_guides

- id
- school_id
- year
- province_scope：固定为广东
- title
- official_url
- source_type
- source_published_at
- source_updated_at
- application_url
- application_start_at
- application_end_at
- requirements
- academic_test_requirements
- subject_requirements
- majors
- enrollment_plan
- assessment_method
- shortlist_rule
- admission_rule
- tuition
- contact_info
- batch_info
- status：draft、pending_review、published、archived
- version
- created_by
- reviewed_by
- published_at
- created_at
- updated_at

### 7.4 timeline_events

- id
- school_id
- guide_id
- year
- event_type
- title
- description
- starts_at
- ends_at
- date_precision：exact、range、month、unknown
- source：guide_generated、manual
- manual_override
- override_reason
- status：draft、published
- created_at
- updated_at

### 7.5 score_formulas

- id
- school_id
- guide_id
- year
- name
- formula_type：weighted_sum、custom
- inputs_schema
- calculation_config
- explanation
- source_url
- status：draft、published、archived
- created_at
- updated_at

`inputs_schema` 示例：

```json
[
  { "key": "gaokao", "label": "高考成绩", "max": 750, "required": true },
  { "key": "school_assessment", "label": "学校考核成绩", "max": 100, "required": true },
  { "key": "academic_test", "label": "学考折算成绩", "max": 100, "required": true }
]
```

`calculation_config` 示例：

```json
{
  "weights": {
    "gaokao": 0.6,
    "school_assessment": 0.3,
    "academic_test": 0.1
  },
  "normalize_to": 100
}
```

### 7.6 experiences

- id
- user_id
- school_id
- year
- major_group
- candidate_track：物理类、历史类、其他
- stage
- assessment_types
- location
- shortlisted
- admitted
- process_text
- question_types
- preparation_text
- difficulty_score
- pressure_score
- differentiation_score
- advice_text
- anonymous
- verification_status：none、pending、verified、rejected
- review_status：draft、pending_review、published、rejected、hidden
- useful_count
- created_at
- updated_at

### 7.7 experience_verifications

- id
- experience_id
- user_id
- verification_type：初审截图、准考证截图、入围截图、录取截图、其他
- asset_url
- status：pending、verified、rejected
- reviewer_id
- review_note
- created_at
- updated_at

### 7.8 interactions

- id
- user_id
- target_type：school、experience
- target_id
- action：favorite、useful
- created_at

唯一约束：

- 同一用户对同一目标的同一 action 只能存在一条记录。

### 7.9 reports

- id
- user_id
- target_type：experience、user
- target_id
- reason
- description
- status：pending、resolved、rejected
- reviewer_id
- resolution_note
- created_at
- updated_at

### 7.10 source_documents

- id
- url
- title
- source_type
- fetched_at
- content_hash
- raw_text_asset_url
- status：candidate、accepted、rejected
- created_at
- updated_at

### 7.11 ingestion_runs

- id
- query
- year
- school_id
- status：running、completed、failed、reviewed
- extracted_payload
- confidence_score
- reviewer_id
- review_note
- created_at
- updated_at

## 8. API 设计

### 8.1 学生端 API

`GET /schools`

- 查询学校列表。
- 参数：`year`、`status`、`keyword`。

`GET /schools/:id`

- 返回学校基础信息、当前年份简章、时间线、公式、精选面经。
- 参数：`year`。

`GET /guides`

- 查询简章列表。
- 参数：`year`、`schoolId`、`status`、`keyword`。
- 游客只能查到 `published` 数据。

`GET /guides/:id`

- 返回简章详情、官方来源、结构化字段、版本信息摘要。

`GET /timeline`

- 查询时间线。
- 参数：`year`、`schoolIds`、`mine`。
- `mine=true` 时要求登录，返回用户收藏学校节点。

`POST /score/calculate`

- 输入：`schoolId`、`year`、`scores`。
- 输出：综合分、分项贡献、公式说明、来源链接。

`GET /experiences`

- 查询面经。
- 参数：`schoolId`、`year`、`stage`、`assessmentType`、`verified`、`sort`。
- 只返回 `published` 数据。

`POST /experiences`

- 登录后提交面经。
- 新投稿默认进入 `pending_review`。

`POST /experiences/:id/useful`

- 登录后点有用。

`POST /favorites`

- 收藏学校或面经。

`DELETE /favorites/:id`

- 取消收藏。

`POST /reports`

- 登录后举报内容或用户。

`GET /me`

- 获取当前用户信息。

`GET /me/favorites`

- 获取收藏学校和收藏面经。

`GET /me/experiences`

- 获取我的投稿和审核状态。

### 8.2 管理端 API

`POST /admin/ingestion-runs`

- 创建 AI 检索与抽取任务。

`GET /admin/ingestion-runs`

- 查看任务列表。

`GET /admin/ingestion-runs/:id`

- 查看候选来源、抽取结果和置信度。

`POST /admin/guides`

- 创建或保存简章草稿。

`POST /admin/guides/:id/submit-review`

- 提交审核。

`POST /admin/guides/:id/publish`

- 人工审核后发布。

`POST /admin/guides/:id/archive`

- 归档旧版本。

`POST /admin/formulas`

- 创建或更新公式草稿。

`POST /admin/formulas/:id/publish`

- 发布公式。

`GET /admin/experiences`

- 查看待审面经。

`POST /admin/experiences/:id/review`

- 审核面经，通过、退回、隐藏。

`GET /admin/verifications`

- 查看认证材料审核队列。

`POST /admin/verifications/:id/review`

- 审核认证材料。

`GET /admin/reports`

- 查看举报列表。

`POST /admin/reports/:id/resolve`

- 处理举报。

## 9. 系统架构

### 9.1 技术架构

- 前端：移动优先 Web，适配手机浏览器和桌面浏览器。
- 后端：Node.js API 服务。
- 数据库：PostgreSQL。
- 对象存储：保存认证材料、来源文档快照等非结构化文件。
- 搜索：MVP 使用 PostgreSQL 全文检索；后续可升级 Elasticsearch 或 Meilisearch。
- AI 入库服务：负责官方来源检索、正文抽取、字段结构化和置信度输出。
- 管理端：与学生端共用账号体系，通过角色控制访问。

### 9.2 数据流

官方数据入库：

1. 管理员创建检索任务。
2. AI 服务检索官方来源并生成 `source_documents`。
3. AI 服务抽取简章字段、时间节点和公式候选。
4. 系统保存为 `admission_guides`、`timeline_events`、`score_formulas` 草稿。
5. 数据审核员人工审核。
6. 发布后学生端可见。

面经入库：

1. 用户手机号登录。
2. 用户填写结构化表单并提交。
3. 系统进行敏感词和隐私信息初筛。
4. 内容审核员人工审核。
5. 审核通过后展示。
6. 如上传认证材料，认证审核通过后展示认证标签。

### 9.3 权限与安全

- 所有管理端接口必须校验角色。
- 认证材料只允许审核员和管理员访问。
- 前台不得返回手机号、认证材料 URL、管理备注。
- 用户删除或隐藏投稿后，前台不可见，后台保留审计记录。
- 所有发布、审核、隐藏、归档操作记录操作人和时间。

## 10. 验收标准

### 10.1 功能验收

- 游客可以浏览学校、简章、时间线、计算器和已发布面经。
- 登录用户可以收藏学校、收藏面经、提交面经、点有用、举报。
- 管理员可以创建 AI 入库任务、审核简章、发布简章、配置公式、审核面经。
- 学校详情页能聚合展示简章、时间线、计算器入口和面经。
- 时间线能按全部学校和用户收藏学校两种模式展示。

### 10.2 数据验收

- 2024-2026 年每条已发布简章必须有官方来源链接。
- 每条已发布简章必须有学校、年份、标题、来源更新时间或发布时间。
- 每个可计算的公式必须有来源链接和公式说明。
- 没有明确公式的学校年份不得展示计算入口。
- 面经必须绑定学校和年份。

### 10.3 质量验收

- 主要页面在 375px、390px、430px 手机宽度下无横向滚动。
- 表单提交失败时必须展示明确错误。
- 计算器输入非法分数时必须阻止计算。
- 草稿或待审核官方数据不得出现在学生端。
- 匿名面经不得暴露账号手机号、真实姓名、认证材料。

## 11. 测试计划

### 11.1 公式测试

- 验证 631 公式计算正确。
- 验证 85/15 公式计算正确。
- 验证自定义权重公式计算正确。
- 验证缺少必填分数时报错。
- 验证分数超过满分时报错。
- 验证学校无公式时不展示计算入口。

### 11.2 数据流测试

- AI 抽取生成草稿后，学生端不可见。
- 简章人工发布后，学生端可见。
- 简章字段修改后，版本号递增。
- 简章时间字段变更后，时间线同步更新。
- 人工覆盖时间线节点后保留覆盖原因。

### 11.3 社区测试

- 登录用户可提交结构化面经。
- 未登录用户不可提交面经、点有用、收藏、举报。
- 面经审核前学生端不可见。
- 匿名面经不展示账号信息。
- 已认证面经展示认证标签但不展示材料。
- 同一用户不能重复点有用。
- 举报后管理端能看到处理队列。

### 11.4 端到端测试

- 高三用户收藏学校，进入我的时间线查看报名截止节点。
- 高三用户进入学校详情页，使用综合分计算器并查看公式依据。
- 高二用户查看学校近三年简章与面经。
- 高一用户从首页进入广东综评介绍和院校概览。
- 用户考后提交面经，管理员审核通过后在学校详情页展示。

## 12. 里程碑

### M1：基础数据与学生端查询

- 完成学校、简章、时间线、公式基础模型。
- 完成首页、院校列表、院校详情、时间线。
- 完成人工后台录入和发布。

### M2：计算器与个人收藏

- 完成公式配置与计算 API。
- 完成综合分计算器页面。
- 完成手机号登录、收藏学校、我的时间线。

### M3：结构化面经社区

- 完成面经投稿、审核、展示。
- 完成收藏面经、有用、举报。
- 完成认证材料上传与审核。

### M4：AI 检索抽取入库

- 完成 AI 检索任务、来源候选、字段抽取草稿。
- 完成人工校验发布流程。
- 完成来源追溯和版本记录。

## 13. 运营与内容规范

### 13.1 官方数据维护

- 每年 3-7 月为高频更新期，需每日检查广东省教育考试院、阳光高考/学信网和重点高校本科招生网。
- 非高频期每周检查一次官方来源。
- 第三方资讯只用于发现线索，不能作为发布依据。

### 13.2 面经审核规范

- 优先通过结构完整、年份明确、学校明确、流程描述清晰的内容。
- 对包含具体未公开原题的内容，要求用户改写为题型类别或审核不通过。
- 对包含个人敏感信息的内容，审核员应打回修改或脱敏后发布。
- 对售卖资料、包过承诺、代写材料、外部引流内容直接隐藏并限制账号。

## 14. 默认假设

- 首发只做移动优先 Web，不做小程序和 App。
- 首发使用手机号验证码登录。
- 首发提醒只做站内展示，不接短信、微信、邮件。
- 首发数据库采用 PostgreSQL。
- 首发后端采用 Node.js API。
- 首发搜索使用 PostgreSQL 全文检索。
- 官方数据必须人工审核后发布。
- 面经社区不开放评论和私信。
