# 首次固定 SDK 适用性审阅

2026-10-21。针对已发布 `dsh-v0.2.1-rc.2` / `687f282e8625c6b8d11ff58211a90524be2e4317` 的技术审阅，不是一次虚构的旧版升级，也不代表人类批准发布。原观察基线的 `observationsOnly` 保持不变；独立 bootstrap 记录绑定该基线全文与发行配置摘要。

42 篇指南原文均从固定提交读取并按 Git blob SHA-1 核对，逐篇对照自有源码；适用项通过已有合同及本次 C85 的实际 SDK 补测确认。不适用项说明本包未消费的接口，不能推广成所有外部插件兼容。后续新增或变化的指南仍须重新审阅，不自动沿用本记录。

已逐项核对固定SDK发行Web的190行事实，并在全新TEMP通过公开CLI再次读取相同摘要。本扩展只完整替换默认模型、llm-pi-ai、ui-settings-models三行配置，禁用九行并插入自身；其他行继承发行模板。C1/C2/C6/C7/C8验证组合、完整Provider、公开槽位、主题及出站禁用；C63/C76另有实际CLI安装合同。未据此声称Desktop窗口、15分钟实网或所有第三方插件已验收。

发行配置摘要为 `bc2effc3aa72422498ca9ef2036667078960d7499fdc202abe5c10d2f4d2cb97`；基线全文 SHA-256 为 `7d7889b44168979debc695ff8f499cf042563443886226655903cde3b2509d42`。C85 的受控 PTC 程序只在新建 TEMP 执行，策略由测试显式提供；它证明嵌套调用与投影，不证明 OS 沙箱。凭据检查只用 EXAMPLE 值，未调用真实模型。

| 序号 | 固定上游指南 | 判断与理由 |
| --- | --- | --- |
| 01 | [schedule-optional-bundle](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.1.7-rc.2/schedule-optional-bundle/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-01.json) |
| 02 | [transcript-view-legacy-normal](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.1.7-rc.2/transcript-view-legacy-normal/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-02.json) |
| 03 | [account-sign-in-errors](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.0-rc.2/account-sign-in-errors/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-03.json) |
| 04 | [bundled-python-tests](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.0-rc.2/bundled-python-tests/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-04.json) |
| 05 | [primary-runtime-python-aliases](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.0-rc.2/primary-runtime-python-aliases/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-05.json) |
| 06 | [remove-runtime-invariants](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.0-rc.2/remove-runtime-invariants/guide.md) | [已处理](../contracts/ack/bootstrap-guide-06.json) |
| 07 | [schedule-bundle-retired](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.0-rc.2/schedule-bundle-retired/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-07.json) |
| 08 | [subpath-plugin-display-manifest](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.0-rc.2/subpath-plugin-display-manifest/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-08.json) |
| 09 | [deepseek-model-discovery](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/deepseek-model-discovery/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-09.json) |
| 10 | [desktop-test-auth-popup](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/desktop-test-auth-popup/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-10.json) |
| 11 | [experimental-package-composition](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/experimental-package-composition/guide.md) | [已处理](../contracts/ack/bootstrap-guide-11.json) |
| 12 | [instruction-home-override](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/instruction-home-override/guide.md) | [已处理](../contracts/ack/bootstrap-guide-12.json) |
| 13 | [job-id-identity](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/job-id-identity/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-13.json) |
| 14 | [jsonl-persistence-plugin](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/jsonl-persistence-plugin/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-14.json) |
| 15 | [mock-messages-events](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/mock-messages-events/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-15.json) |
| 16 | [native-subagent-bundle-tools](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/native-subagent-bundle-tools/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-16.json) |
| 17 | [new-session-generations](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/new-session-generations/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-17.json) |
| 18 | [plugin-option-placement](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/plugin-option-placement/guide.md) | [已处理](../contracts/ack/bootstrap-guide-18.json) |
| 19 | [python-optional-resources](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/python-optional-resources/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-19.json) |
| 20 | [python-ptc-sandbox](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/python-ptc-sandbox/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-20.json) |
| 21 | [session-title-adapters](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/session-title-adapters/guide.md) | [已处理](../contracts/ack/bootstrap-guide-21.json) |
| 22 | [session-title-provider-strategy](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/session-title-provider-strategy/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-22.json) |
| 23 | [ssh-helper-launch](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/ssh-helper-launch/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-23.json) |
| 24 | [subagent-activations](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/subagent-activations/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-24.json) |
| 25 | [subagent-preset-composition](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/subagent-preset-composition/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-25.json) |
| 26 | [team-direct-inbox](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/team-direct-inbox/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-26.json) |
| 27 | [terminal-command-labels](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/terminal-command-labels/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-27.json) |
| 28 | [tool-presentation-mode](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/tool-presentation-mode/guide.md) | [已处理](../contracts/ack/bootstrap-guide-28.json) |
| 29 | [web-listener-trust-config](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/web-listener-trust-config/guide.md) | [已处理](../contracts/ack/bootstrap-guide-29.json) |
| 30 | [working-directory](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.1/working-directory/guide.md) | [已处理](../contracts/ack/bootstrap-guide-30.json) |
| 31 | [deepseek-account-identity-watch](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/deepseek-account-identity-watch/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-31.json) |
| 32 | [deepseek-account-model-catalog](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/deepseek-account-model-catalog/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-32.json) |
| 33 | [desktop-font-size-shortcuts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/desktop-font-size-shortcuts/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-33.json) |
| 34 | [from-default-profile-replaces-target](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/from-default-profile-replaces-target/guide.md) | [已处理](../contracts/ack/bootstrap-guide-34.json) |
| 35 | [operator-connect](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/operator-connect/guide.md) | [已处理](../contracts/ack/bootstrap-guide-35.json) |
| 36 | [pi-ai-azure-provider](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/pi-ai-azure-provider/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-36.json) |
| 37 | [pi-ai-model-discovery](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/pi-ai-model-discovery/guide.md) | [已处理](../contracts/ack/bootstrap-guide-37.json) |
| 38 | [plugin-install-over-installed](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/plugin-install-over-installed/guide.md) | [已处理](../contracts/ack/bootstrap-guide-38.json) |
| 39 | [sdk-minimal-image-compaction](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/sdk-minimal-image-compaction/guide.md) | [已处理](../contracts/ack/bootstrap-guide-39.json) |
| 40 | [stored-credentials-precedence](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.2/stored-credentials-precedence/guide.md) | [已处理](../contracts/ack/bootstrap-guide-40.json) |
| 41 | [plugin-engines-dsh](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.3/plugin-engines-dsh/guide.md) | [已处理](../contracts/ack/bootstrap-guide-41.json) |
| 42 | [account-notification-fields](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/upgrade-guide/v0.2.1-alpha.4/account-notification-fields/guide.md) | [当前不适用](../contracts/ack/bootstrap-guide-42.json) |

| 已验证 | 待验证 | 未验证 |
| --- | --- | --- |
| 42逐项技术判断、实际SDK发行模板190行、C85实际PTC/模型目录/凭据来源与生产UI处理器 | 当前提交CI、默认晋升预览 | 真实Canary七日观察、稳定发布、未来新SDK迁移、完整浏览器/桌面验收 |

初始适用性记录只解除相应来源审阅缺项。它不会生成Canary、跳过七日原始证据、上传模型凭据或自动发布稳定版。

本机最终完整563/563及154文件归档通过；当前提交CI与默认晋升预览另行核对。
