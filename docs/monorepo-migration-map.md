# Monorepo Migration Map

## Legacy -> New

- `nl2gate/main.py` -> `apps/nl2gate-api/main.py`
- `nl2gate/requirements.txt` -> `apps/nl2gate-api/requirements.txt`
- `nl2gate/Dockerfile` -> `ops/docker/nl2gate-api/Dockerfile`
- `nl2gate/day5_7/docker-compose.edge.yml` -> `ops/docker/nl2gate-api/docker-compose.edge.yml`
- `nl2gate/day5_7/start_edge.ps1` -> `ops/scripts/nl2gate-api/start.ps1`
- `nl2gate/day5_7/start_edge.sh` -> `ops/scripts/nl2gate-api/start.sh`
- `nl2gate/day5_7/stop_edge.ps1` -> `ops/scripts/nl2gate-api/stop.ps1`
- `nl2gate/day5_7/stop_edge.sh` -> `ops/scripts/nl2gate-api/stop.sh`
- `nl2gate/day5_7/smoke_test.py` -> `tests/smoke/nl2gate_smoke.py`
- `nl2gate/day1_2/indicator_standard_crosswalk.json` -> `mappings/cross-spec/indicator_standard_crosswalk.json`
- `nl2gate/projects/GXX_2024_XXX.json` -> `projects/gxx-2024-xxx/project.profile.json`
- `nl2gate/normdocs/T0921-2019.normdoc.json` -> `normdocs/library/cn/mot/t0921/2019/normdoc.json`
- `nl2gate/normdocs/T0931-2019.normdoc.json` -> `normdocs/library/cn/mot/t0931/2019/normdoc.json`
- `nl2gate/normdocs/T0912-2019.normdoc.json` -> `normdocs/library/cn/mot/t0912/2019/normdoc.json`
- `nl2gate/normdocs/T0951-2008.normdoc.json` -> `normdocs/library/cn/mot/t0951/2008/normdoc.json`
- `nl2gate/standards/JTG_F80_1_2017.standard.json` -> `standards/library/cn/mot/jtg-f80-1/2017/standarddoc.json`
- `nl2gate/standards/JTG_3450_2019.standard.json` -> `standards/library/cn/mot/jtg-3450/2019/standarddoc.json`
- `nl2gate/standards/JTG_T_F20_2015.standard.json` -> `standards/library/cn/mot/jtg-t-f20/2015/standarddoc.json`
