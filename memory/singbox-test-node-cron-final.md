# Sing-box 测试节点 - Cron Final

## 节点信息
- **服务器**: 194.156.162.243
- **端口**: 19994
- **协议**: VLESS + Reality
- **UUID**: cd1e80d8-0d97-4ba9-a198-e213d9e4e43c
- **Public Key**: S-Hnb7EXAbmCGkbWbM2WXMMe2LJK6e52XXKFDQqqSTg
- **Short ID**: 844197da5f8bde7d
- **SNI**: www.apple.com

## VLESS 链接（v2rayN/Nekoray）
```
vless://cd1e80d8-0d97-4ba9-a198-e213d9e4e43c@194.156.162.243:19994?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.apple.com&fp=chrome&pbk=S-Hnb7EXAbmCGkbWbM2WXMMe2LJK6e52XXKFDQqqSTg&sid=844197da5f8bde7d&type=tcp&headerType=none#Sing-box-Test-Cron-Final
```

## Clash Meta 配置
```yaml
proxies:
  - name: "Sing-box-Test-Cron-Final"
    type: vless
    server: 194.156.162.243
    port: 19994
    uuid: cd1e80d8-0d97-4ba9-a198-e213d9e4e43c
    network: tcp
    tls: true
    udp: true
    flow: xtls-rprx-vision
    servername: www.apple.com
    reality-opts:
      public-key: S-Hnb7EXAbmCGkbWbM2WXMMe2LJK6e52XXKFDQqqSTg
      short-id: 844197da5f8bde7d
    client-fingerprint: chrome
```

## 部署时间
2026-03-01 13:34 (Cron 自动化任务)

## 测试状态
✅ 节点已部署
✅ 端口监听正常 (19994)
✅ 服务运行正常
✅ 配置验证通过

## 关键发现
1. **配置格式修复** - inbound 配置需要包裹在 `inbounds` 数组中
2. **配置合并方式** - 使用 `sing-box merge` 而非 `jq -s`
3. **架构验证成功** - 数据分层、模块化设计均可行
