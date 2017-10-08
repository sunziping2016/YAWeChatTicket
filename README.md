# 关于
这个项目是想要再造一个更好的“紫荆之声”微信公众号后端程序。高性能、稳定、安全是我们的最终目标。

## TODO
* 注册，绑定学生信息和邮箱

## 特性
* 前后端分离：无HTML模板，后端只负责提供动态内容而非表现；
* RESTful：AJAX部分的API设计符合RESTful语义；
* 实时消息：借助Socket.IO，任何数据库的更新可以及时反馈到终端；
* Scalable：状态管理及消息分发依托数据库（除缓存），支持多种分布式解决方案；
* 安全：使用jwt，微信认证借助OAuth，任何用户输入都经过检查，用一次性token防回放贵办攻击，关键API依据ip地址对次数进行限制，RBAC；
* 日志：良好的日志信息，易于定位错误。

## 配置

本项目需要配置两个数据库：
* mongodb: 主要用于存储用户、活动数据；
* redis: 主要用于存储临时信息和分发消息。

```shell
cp config.example.json config.json
```

而后修改`config.json`。一些不那么显然的配置参数解释如下：
* `site`: 向微信发送的所有URL的域名（即客户端）,它不一定必须是本地文件（甚至可以使GitHub Pages）；
* `cluster`：可以是`boolean`或整型。如果是`true`，则采用与CPU数目相同的workers；如果是`false`，则采用单进程。如果为非0整数，则作为Worker的数目；
* `sticky`：是否使用sticky session，必须是`boolean`类型。如果启用，会依据对方的IP地址（不看请求头），分配链接给Worker。详见“分布式解决方案”。

## 分布式解决方案
一般情况下由于使用了自带声明的jwt，分布式是不需要sticky session的，但如果客户端采用long polling与服务器建立双向通信，由于存在临时状态，就需要sticky session。但注意，如果存在反向代理并使用Node.js的`cluster`模块，情形会变得很复杂。为了获取客户端的真实IP，我们不得不在Master进程解析HTTP请求头中的代理信息，而后将收到的部分信息再发送给Worker进程。这是一笔巨大的以至于完全不划算的性能开销，因而我们的`1sticky`并没有依照这种方式实现，而只是查看socket的远程地址。

以下给出几种可行的分布式方案：
1. 有sticky session，无代理（不推荐）：不支持HTTPS，静态文件也有额外开销，无法应对更大的分布式情况；
2. 有sticky session，上游使用透明代理（不推荐）：上游需要ROOT权限，无法应对更大的分布式情况；
3. 无sticky session，禁止long pulling：在不支持WebSocket的情景下，用户将丧失获取实时推送的能力；
4. 上游负责负载均衡，Node.js多个无cluster的实例监听在不同端口（推荐）：没啥缺点。如Nginx自带的sticky模块可以想怎么做怎么做。可通过命令行参数`--port`来指定端口。

目前我们使用方案3进行开发。计划发布时改到方案4。


# 设计
用户权限分为三种：普通用户、发布者、管理员。用户可以拥有0个或多个权限。

签发的jwt除了expire相关的字段，还有以下可选字段`{uid: ..., role: ..., uat: ..., wid: ..., }`其中`uid`、`role`和`uat`确保同时出现，表示用户的id、权限和安全更新时间。`wid`是微信的openId，主要用于微信认证。

## Mongoose
### `users`表
认证相关的字段包括`username`、`password`和`studentId`，最后一个可选。如果`password`为`null`，密码验证永远错误，会禁止用户通过密码登录（只能借助邮箱认证）。`username`不一定必须是Tsinghua的用户名，可以是特殊的用户。

可选的用户信息相关的字段包括`avatar`、`avatarThumbnail`、`realname`、`department`和`email`。其中`avatar`、`avatarThumbnail`为用户自定义的头像，应同时出现，加了文件删除hook。`studentId`、`realname`和`department`应当一同出现。`email`只有邮箱验证才会出现。

`createdAt`、`updatedAt`、`secureUpdatedAt`是自动字段，其中`updatedAt`主要用于用户推送去重，`secureUpdatedAt`主要是为了续jwt的时候检查之用，当密码发生更新的时候会自动更新。

`deleted`、`blocked`表示用户是否删除和加入了黑名单。原则上前者的软删除应当对客户端透明（与硬删除一致）。

`roles`为权限数组，可以包含`user, publisher, administrator`。`wechatId`为绑定的微信用户，原则上应当双向绑定。

虚拟字段有`hasPassword`和`rolesMask`，前者表示`password`是否为`null`，后者拥有jwt中的权限表示。

成员方法有`setPassword`、`checkPassword`和`toPlainObject`。类方法有`mapIdTsinghua`、`rolesToMask`和`maskToRoles`。

### `wechatusers`表
`_id`即为用户openId。可选的用户信息字段包括`unionId`、`subscribe`（是否关注）、`nickname`、`avatar`、`avatarThumbnail`和`gender`。

`createdAt`、`updatedAt`是自动字段。此外也有`deleted`和`blocked`。

## RESTful API
### 返回内容
如果成功处理，返回的内容为`{code: 200, type: 'OK', data: ...}`，其中`code`与HTTP协议一致，`data`可选。如果发生错误，返回的内容为`{code: ..., type: ..., message: ..., data: ...}`。服务器对于内部错误不会返回额外的信息。

### 验证身份
**基础认证：** `POST /api/auth {strategy: ..., payload: ...} -> {token: ..., user: ..., wechatUser: ...}`，返回的user和wechatUser字段可选。对于所有认证方式，如果接受到的旧jwt是过期，都是静默错误。注意返回的错误也可能包含有用的data字段（比如新的token和用户等等）。

`strategy`可以为以下几种之一：
* `local`：`payload`为`{username: ..., password: ..., jwt: ...}`或者`{studentId: ..., password: ..., jwt: ...}`，用户名密码验证，其中`jwt`可选。
* `session`：`payload`为`{token: ..., jwt: ...}`，从临时`login`回话中获取用户。
* `jwt`: `payload`为jwt。试图续jwt。

如果`local`和`session`认真失败会尝试jwt认证。这部分可能的错误情况太多了，出错了还要继续尝试，逻辑太复杂了，实在是一言难尽。

**微信认证：** `GET /api/auth/wechat {code: ..., to: ...}` 用于微信OAuth登录。会检查`to`是否是跨站点。如果`to`的URL上有额外的`token`参数会作为临时登录回话合并`uid`到当前的回话上。



## Socket.IO 实时通信
格式为`消息(参数,...)`。

客户端可发送以下内容至服务端
* `auth(token)`：清空先前订阅的事件，依据用户和权限订阅。


## Redis
### 临时`login`回话
主要为了避免重放攻击。包含可选的`uid`和`wid`
