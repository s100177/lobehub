# AI 浏览器页面技能包模板

## 1. 目的

页面技能包用于告诉 AI：

- 这是什么页面。
- 关键字段有哪些。
- 哪些操作安全。
- 哪些操作危险。
- 哪些信息缺失时要问用户。
- 常见业务目标如何执行。

## 2. 模板

```json
{
  "ambiguityRules": ["当多个可选项都满足条件时询问用户", "当预算缺失时先给建议并等待确认"],
  "confirmationPoints": [
    {
      "id": "before_submit",
      "title": "提交前确认",
      "reason": "提交后不可撤销"
    }
  ],
  "description": "页面说明",
  "entities": ["entity_a", "entity_b"],
  "fillGaps": [
    {
      "field": "region",
      "mode": "ask_user",
      "reason": "地域会影响成本或结果"
    },
    {
      "field": "instanceType",
      "mode": "auto_suggest",
      "reason": "可根据目标自动推荐"
    }
  ],
  "page": "page_id",
  "pageType": "form",
  "riskActions": ["risk_action_a", "risk_action_b"],
  "safeActions": ["safe_action_a", "safe_action_b"],
  "site": "your-domain.com",
  "workflows": [
    {
      "intent": "user_goal_id",
      "goal": "目标说明",
      "constraints": ["约束 1", "约束 2"],
      "steps": [
        {
          "id": "inspect",
          "title": "读取页面状态",
          "type": "inspect"
        },
        {
          "id": "select",
          "title": "选择关键配置",
          "type": "select",
          "gaps": ["region"]
        },
        {
          "id": "confirm",
          "title": "提交前确认",
          "type": "risk_gate"
        }
      ]
    }
  ]
}
```

## 3. 字段说明

### 3.1 `site`

站点域名或业务系统标识。

### 3.2 `page`

页面唯一标识，例如：

- `cloud_buy`
- `order_form`
- `domain_mapping`
- `resource_list`

### 3.3 `entities`

页面里最重要的业务实体，例如：

- `region`
- `plan`
- `price`
- `duration`
- `quota`
- `account`

### 3.4 `safeActions`

AI 可以直接执行的动作，例如：

- 选择普通配置。
- 填写非敏感表单。
- 阅读价格。
- 切换标签。

### 3.5 `riskActions`

必须暂停确认的动作，例如：

- 提交订单。
- 支付。
- 删除资源。
- 释放资源。
- 授权。

### 3.6 `ambiguityRules`

当页面存在歧义时如何处理。

### 3.7 `confirmationPoints`

明确哪些步骤前必须停下。

### 3.8 `fillGaps`

执行中页面信息不足时，哪些字段：

- 由 AI 自动推荐。
- 由用户选择。
- 必须用户手动输入。

### 3.9 `workflows`

用户目标对应的标准执行流。

## 4. 推荐写法

- 一个页面一个技能包。
- 一个业务目标可以有多个 workflow。
- 风险动作宁可多拦，不可漏拦。
- 没有把握的字段默认 `ask_user`。
- 能从页面自动读出来的字段，优先 `auto_suggest`。

## 5. 示例

### 5.1 业务表单页

```json
{
  "ambiguityRules": ["部门不明确时询问用户", "审批级别不明确时先给建议"],
  "confirmationPoints": [
    {
      "id": "before_submit",
      "title": "提交前确认",
      "reason": "提交后进入审批流"
    }
  ],
  "description": "费用审批表单",
  "entities": ["amount", "department", "reason", "approval_level"],
  "fillGaps": [
    { "field": "department", "mode": "ask_user", "reason": "影响审批流" },
    { "field": "reason", "mode": "auto_fill_if_known", "reason": "可从上下文补全" }
  ],
  "page": "expense_approval_form",
  "pageType": "form",
  "riskActions": ["submitForm"],
  "safeActions": ["fillReason", "selectDepartment"],
  "site": "example.com",
  "workflows": [
    {
      "intent": "submit_expense_approval",
      "goal": "提交费用审批",
      "steps": [
        { "id": "inspect", "title": "读取表单状态", "type": "inspect" },
        { "id": "fill", "title": "填写已知信息", "type": "fill" },
        { "id": "confirm", "title": "提交前确认", "type": "risk_gate" }
      ]
    }
  ]
}
```

## 6. 结论

技能包越完整，AI 越像 KiKi：

- 先理解页面。
- 再理解用户用途。
- 再规划多阶段任务。
- 再在页面里自动补全缺失信息。
- 最后在风险节点前停下。
