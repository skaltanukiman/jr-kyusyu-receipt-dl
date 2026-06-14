@echo off

REM .batが配置されているディレクトリに移動
cd /d %~dp0

REM scriptの呼び出し
call npm run download

pause