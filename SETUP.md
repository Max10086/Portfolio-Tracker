# Portfolio Tracker - 设置指南

## 数据库迁移

### 初始设置

如果这是首次设置项目，需要运行两个迁移脚本：

1. `supabase/migrations/001_initial_schema.sql` - 创建基础表结构
2. `supabase/migrations/002_add_transactions.sql` - 创建交易记录表（支持买入/卖出和日期）

### 迁移步骤

#### 方法 1: 使用 Supabase Dashboard（推荐）

1. 登录 [Supabase Dashboard](https://app.supabase.com)
2. 选择你的项目
3. 进入 **SQL Editor**
4. 点击 **New Query**
5. 首先复制并粘贴 `supabase/migrations/001_initial_schema.sql` 文件的内容
6. 点击 **Run** 执行 SQL
7. 创建新查询，复制并粘贴 `supabase/migrations/002_add_transactions.sql` 文件的内容
8. 点击 **Run** 执行 SQL

#### 方法 2: 使用 Supabase CLI

```bash
# 初始化 Supabase（如果还没有）
supabase init

# 链接到你的项目
supabase link --project-ref your-project-ref

# 运行迁移
supabase db push
```

## 环境变量配置

创建 `.env.local` 文件（如果还没有）：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
BASE_CURRENCY=USD
```

### 如何获取这些值：

1. **NEXT_PUBLIC_SUPABASE_URL**: 
   - 在 Supabase Dashboard → Settings → API
   - 复制 "Project URL"

2. **SUPABASE_SERVICE_ROLE_KEY**:
   - 在 Supabase Dashboard → Settings → API
   - 复制 "service_role" key（⚠️ 保密，不要提交到 Git）

3. **BASE_CURRENCY**:
   - 可选，默认为 USD
   - 可以是 USD, CNY, HKD 等

## 验证设置

运行迁移后，重启开发服务器：

```bash
npm run dev
```

然后访问 `http://localhost:3000`，应用应该正常工作了。

## 使用指南

### 添加交易
1. 点击 "Add Transaction" 按钮
2. 选择交易类型：Buy（买入）或 Sell（卖出）
3. 选择市场类型（US、CN、HK、CRYPTO）
4. 输入股票代码
5. 输入数量
6. 选择交易日期
7. （可选）输入成交价格和备注
8. 点击提交

### 查看持仓
- "Holdings" 标签页显示当前持仓摘要（从交易记录自动计算）
- 包含实时价格和总价值

### 管理交易
- "Transactions" 标签页显示所有交易历史
- 可以编辑或删除任何交易记录
- 交易记录变化会自动更新持仓和净值曲线

### 净值曲线
- Net Worth 图表自动从交易记录生成历史数据
- 显示从第一笔交易到现在的净值变化
- 使用当前价格计算历史各时点的投资组合价值

## 故障排除

### "Failed to fetch portfolio snapshots" 错误
说明数据库迁移还没有运行，请按照上面的迁移步骤操作。

### 价格显示 "unavailable"
- 检查股票代码是否正确
- A股请使用纯数字代码（如 600519）
- 美股使用标准代码（如 AAPL, NVDA）
- 可能是 API 限流，稍后重试

### 净值曲线显示 "No data available"
- 确保已添加至少一笔交易记录
- 交易日期需要在过去（不能是未来日期）
