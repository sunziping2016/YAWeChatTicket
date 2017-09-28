# 关于
这个项目是想要再造一个更好的“紫荆之声”微信公众号后端程序。性能、稳定、安全是我们的最终目标。


# 配置
```shell
cp config.example.json config.json
```

而后修改`config.json`。一些不那么显然的配置参数解释如下：
* `site`: 向微信发送的所有URL的域名（即客户端）,它不一定必须是本地文件（甚至可以使GitHub Pages）。
* `cluster`：可以使`boolean`或整型。如果是`true`，则采用与CPU数目相同的workers；如果是`false`，则采用单进程。如果为非0整数，则作为workers的数目。


# 设计

## 数据库表单数据

### id.tsinghua用户及微信用户
懒得写，回头补。

每个用户都潜在可以有两个可绑定的账号：一个是微信，还有一个是id.tsinghua的。用户可以在注册后期绑定。

## RESTful API
### 用户创建、管理`/api/user`
* GET `/api/user`：管理员权限find
* POST `/api/user/bind`: 用户绑定微信
* POST `/api/user`：网页端（绑定id.tsinghua）创建用户（微信端用户是自动在程序启动或用户关注时创建的）
* GET `/api/user/:id`：仅自己或管理员，需要
* PUT/PATCH `/api/user/:id`：仅自己或管理员修改用户信息
