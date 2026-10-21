# MCP programs and project connections

The connections page includes two curated reference servers from
[modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers):
project memory and project files. Memory stores a separate graph for the
connection's exact project. The filesystem server can read and write the
selected project. Tool results are sent to the conversation's selected model.
These programs run as the local user; project tool guards are not an OS sandbox.

Download and verify a version, enter the project's absolute directory, then
choose **信任程序并启用**. Use the same working directory in a new conversation.
An installed program is not enabled by the download action. The interface shows
the package, exact version, source commit/license link, registry integrity,
local tree hash, dependency count and Node requirement. A recorded requirement
that the current Node cannot satisfy disables installation/selection.

The initial recipes pin `2026.8.31`, its SHA-512 and source commit
`a40bc270fb5ece62673f8a1196f57116d885c5eb`. The published package's license says
`SEE LICENSE IN LICENSE`; the complete source license at that commit is retained
as `SOURCE-LICENSE.txt`. It is not described as uniformly MIT.

Daily automatic checks can be disabled. Only enabled sources prepare compatible
program candidates automatically; unused tools are not downloaded. Failed
background downloads are limited to one attempt per candidate per Host day,
with a manual retry available. Candidate discovery and downloading do not select
a version. Review a retained version to stage it for the next Host start, or
select a retained earlier version for an explicit rollback. Disable cancels a
pending selection. Old versions and project memory are retained.

The Host uses its own pinned pnpm with lifecycle scripts, pnpmfiles and automatic
package-manager replacement disabled. Downloads use the fixed npm registry.
The root release integrity is checked against the recipe or the discovered
candidate; the installed lock records dependency integrity. The complete local
program tree is fingerprinted and checked again before launch. Symlinks,
unsupported resolutions, changed same-version release facts and tree drift are
refused. Registry metadata and integrity identify fetched bytes; they do not
prove publisher identity or program safety. Arbitrary package/command/URL input
and external marketplaces are not supported.

The launcher passes only a small OS environment and the explicit memory file
path to third-party programs. It does not pass ambient credentials, DSH_HOME,
NODE_OPTIONS, NODE_PATH or npm configuration. Child stderr is suppressed. Tools
and shared MCP resource requests use the published ToolRuntime's final guard,
and cannot run from another project's session. Calls on one connection are
serialized. Disable blocks new calls immediately and drains calls already in
progress; it cannot undo a filesystem operation that has already happened.

The DSH-zhen-owned grant database stores session ids and connection generations,
without tool arguments or results. Before a later model request, the Host checks
that referenced connections remain enabled in the same project and generation.
Disabling, replacing a version or rebinding requires a fresh conversation for
old results. Do not delete grant records while retaining conversations or call
code rollback a data downgrade.

On Windows, connection directories use native realpath to expand short aliases
and preserve actual spelling. Before using file paths, call the filesystem
server's `list_allowed_directories` and preserve that spelling; the pinned
reference server's prefix checks are case sensitive. This is an adapter measure,
not a modification of the upstream server.

Verified locally: both exact published programs installed with hooks disabled
on Node 22.19.0; an SDK stdio client created/read a synthetic memory graph and
read/wrote a synthetic file while an outside-root read was refused. The programs
listed 9 and 14 tools respectively. C13 exercises the actual DSH MCP plugin,
ToolRuntime, shared resources, project denial despite a permissive pre-policy,
environment isolation, serialized calls, draining and the pre-model grant guard,
using a clearly synthetic server fixture. No real user files, gateway request
or installed Canvas was involved. Browser inspection of this new market UI is
pending. Signed catalogs, revocation feeds, broader sources and automatic code
activation remain separate work.

## Restart, repair and retained programs

**重启连接** drains existing calls and reloads the same program with its current
project/data binding. It verifies the recorded program tree again. The UI's
“已加载” remains a load result, not a continuous liveness probe.

**重新下载并校验** first disables the connection, cancels its pending selection
and waits for current calls/the child process to finish. It then downloads the
same published root version with the same integrity, source commit, Node and
license identity. Installation still disables lifecycle hooks and checks the
entire resolved dependency tree. Re-resolved dependencies or generated install
metadata may change the local tree hash even when the root version is identical.

The previous directory and its installation record move into an owned quarantine
folder. Changed/damaged files are retained for inspection, not described as a
trusted backup. A missing old directory retains its record only. Project files
and the separate memory data path are not moved or cleared. Completion leaves
the connection disabled; inspect the new full digest and choose **信任程序并启用**
again. Old conversation grants remain revoked after that new generation.

Generation checks now run at the tool/resource entry as well as before the next
model request, including the existing recheck after queued calls. A prepared
call from an old conversation cannot regain access after re-enable, repair or
restore. Start a new conversation after replacing/re-enabling a connection;
ordinary restart preserves its generation and valid current conversation.

The retained-record list can restore a program that matched its original digest.
Restore checks its current tree before/after draining, preserves the replaced
program in another record and also leaves the connection disabled. A damaged or
linked retained tree is refused. Program restoration does not downgrade data or
prove compatibility between different program/data versions.

Maintenance rejects overlapping install/select operations for the same source.
Paths are restricted to the app's program/staging/quarantine areas and checked
for links before moves; project and memory storage are separate. An in-process
metadata-save failure rolls the program layout back. Backup records written
before a move can be rediscovered after interruption without loading any code;
this can help restore matching retained bytes while keeping the connection off.
This is cooperative maintenance within the current Host, not a lock against an
unrelated manually started Host or arbitrary same-user filesystem changes.

The owned market state is now schema 2 with archive records; the separate
session-grant database remains schema 1. Older packages may reject the new market
state. Keep compatible code and data together rather than deleting grant records
or forcing a downgrade. Up to 100 retained records are supported; automatic
archive deletion is not implemented.

At decision0015, the complete check passed 106 tests. C18 uses the actual DSH MCP client and
ToolRuntime with a synthetic server to verify drain-before-repair, no new calls
during maintenance, retained data, revoked grants and a genuinely fresh server
on restart. Filesystem fault, missing/damaged program, linked destination,
metadata rollback and interrupted-move record recovery are also covered.

```powershell
node scripts/smoke-mcp-maintenance.mjs
```

This additional check downloads/starts the actual pinned memory server in an
owned system temporary directory, creates a synthetic graph, repairs and
restores the program, then checks the same graph and memory-file bytes. It
passed on Node 22.19.0 with nine tools; the root integrity stayed fixed while
the reinstalled tree digest differed. Its temporary processes/data were cleaned.
It uses no model or paid API, and does not verify the new browser controls or
actual filesystem-server repair.

```powershell
node scripts/smoke-mcp-filesystem-maintenance.mjs
```

Decision0043 additionally verifies the actual pinned filesystem server through
published DSH ToolRuntime and stdio. It registers 14 tools and exercises five
(list_allowed_directories, read_text_file, write_file, edit_file, move_file),
15 calls including refusals. Only owned EXAMPLE TEMP files and synthetic
sessions are used. Restart, re-download and original-program restore preserve
three project files including binary bytes; outside-root and cross-project calls
are refused. Old sessions cannot write after renewed trust; a new session works.
An altered stopped TEMP program is refused; repair retains the damaged copy as
unverified and refuses its restoration. Temporary data/processes are removed.
No model, credentials, paid API, Native changes or browser UI are involved.
Full check334/334 passes. Use --out-name <new-name.json> for a distinct local
evidence file; the script refuses to overwrite existing evidence.


## 连接切换与操作状态

连接切换后清除旧程序维护确认和项目输入，必须在新连接重新审阅。快速双击不重复维护/启用；旧完成结果不能回填或解锁新操作。已经在Host受理的维护不会被此界面保护取消，请检查原处状态；没有自动重试或自动提高信任。 处理器合同见[0065](decisions/0065-market-client-scope.md)；真实浏览器仍需另验。
