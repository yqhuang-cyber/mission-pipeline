# Runtime mission artifacts（Pipeline 生成，可直接在 IDE 打开）

路径规则：

```
missions/runtime/<missionId>/
  v0.1_colloquial_script.md
  v0.2_phased_script.md      ← N1 产出
  v0.3_stepped_script.md     ← N2 产出
  v0.4_component_content.md  ← N3 产出
  …
```

- 权威存储仍是 PostgreSQL `Artifact` 表；这里是为了本地 IDE 查看的镜像。
- 每次 Run 会覆盖同名最新文件；`*.v2.md` 等为历史版本。
- `missions/mission_4/` 下的文件是 **手工基线样例**，不是 Web Runner 实时产物。
