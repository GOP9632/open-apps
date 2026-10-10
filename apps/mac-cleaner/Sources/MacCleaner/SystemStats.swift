import AppKit
import Darwin
import Foundation

/// 讀 CPU、記憶體、行程資訊。全部只讀，不改任何系統設定。
enum SystemStats {
    struct CPUTicks {
        var busy: UInt64
        var total: UInt64
    }

    static func cpuTicks() -> CPUTicks? {
        var info = host_cpu_load_info()
        var count = mach_msg_type_number_t(
            MemoryLayout<host_cpu_load_info>.stride / MemoryLayout<integer_t>.stride)
        let kr = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return nil }
        let user = UInt64(info.cpu_ticks.0)
        let system = UInt64(info.cpu_ticks.1)
        let idle = UInt64(info.cpu_ticks.2)
        let nice = UInt64(info.cpu_ticks.3)
        return CPUTicks(busy: user + system + nice, total: user + system + idle + nice)
    }

    struct Memory {
        var total: UInt64
        var app: UInt64          // App 記憶體
        var wired: UInt64        // 系統固定使用
        var compressed: UInt64   // 被壓縮
        var cached: UInt64       // 快取檔案（需要時可以馬上讓出來）
        var swap: UInt64         // 寫到磁碟上的置換空間
        var pressure: Int        // 1 正常、2 偏高、4 吃緊
        var used: UInt64 { app + wired + compressed }
    }

    static func memory() -> Memory? {
        var stats = vm_statistics64()
        var count = mach_msg_type_number_t(
            MemoryLayout<vm_statistics64>.stride / MemoryLayout<integer_t>.stride)
        let kr = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return nil }
        let page = UInt64(getpagesize())
        let internalPages = UInt64(stats.internal_page_count)
        let purgeable = UInt64(stats.purgeable_count)
        return Memory(
            total: ProcessInfo.processInfo.physicalMemory,
            app: (internalPages > purgeable ? internalPages - purgeable : 0) * page,
            wired: UInt64(stats.wire_count) * page,
            compressed: UInt64(stats.compressor_page_count) * page,
            cached: (UInt64(stats.external_page_count) + purgeable) * page,
            swap: swapUsed(),
            pressure: pressureLevel()
        )
    }

    static func swapUsed() -> UInt64 {
        var usage = xsw_usage()
        var size = MemoryLayout<xsw_usage>.size
        guard sysctlbyname("vm.swapusage", &usage, &size, nil, 0) == 0 else { return 0 }
        return usage.xsu_used
    }

    static func pressureLevel() -> Int {
        var level: Int32 = 1
        var size = MemoryLayout<Int32>.size
        guard sysctlbyname("kern.memorystatus_vm_pressure_level", &level, &size, nil, 0) == 0 else { return 1 }
        return Int(level)
    }

    // MARK: 各 App 用了多少

    struct ProcessSample {
        var memory: UInt64
        var cpuNanos: UInt64
        /// 依用途拆開：用途 → (記憶體, 行程數)
        var parts: [String: (memory: UInt64, count: Int)] = [:]
    }

    private static let timebase: mach_timebase_info_data_t = {
        var tb = mach_timebase_info_data_t()
        mach_timebase_info(&tb)
        return tb
    }()

    /// 每個行程歸到它所在的 .app（Chrome 的一堆 Helper 都算進 Chrome）。
    /// 回傳 [群組路徑: 合計]。讀不到的行程（例如系統的）會略過。
    static func sampleProcesses() -> [String: ProcessSample] {
        let estimate = proc_listallpids(nil, 0)
        guard estimate > 0 else { return [:] }
        var pids = [Int32](repeating: 0, count: Int(estimate) + 64)
        let n = pids.withUnsafeMutableBufferPointer {
            proc_listallpids($0.baseAddress, Int32($0.count * MemoryLayout<Int32>.size))
        }
        guard n > 0 else { return [:] }

        var result: [String: ProcessSample] = [:]
        var pathBuffer = [CChar](repeating: 0, count: 4096)
        for pid in pids.prefix(Int(n)) where pid > 0 {
            var info = rusage_info_v4()
            let ok = withUnsafeMutablePointer(to: &info) {
                $0.withMemoryRebound(to: rusage_info_t?.self, capacity: 1) {
                    proc_pid_rusage(pid, RUSAGE_INFO_V4, $0)
                }
            }
            guard ok == 0 else { continue }
            guard proc_pidpath(pid, &pathBuffer, UInt32(pathBuffer.count)) > 0 else { continue }
            let path = String(cString: pathBuffer)
            let key: String
            if let r = path.range(of: ".app/") {
                key = String(path[..<r.lowerBound]) + ".app"
            } else {
                key = path
            }
            let ticks = info.ri_user_time + info.ri_system_time
            let nanos = ticks * UInt64(timebase.numer) / UInt64(max(timebase.denom, 1))
            var s = result[key] ?? ProcessSample(memory: 0, cpuNanos: 0)
            s.memory += info.ri_phys_footprint
            s.cpuNanos += nanos
            let part = processRole(pid: pid, executable: (path as NSString).lastPathComponent)
            let old = s.parts[part] ?? (0, 0)
            s.parts[part] = (old.memory + info.ri_phys_footprint, old.count + 1)
            result[key] = s
        }
        return result
    }

    /// 瀏覽器和 Electron App（Chrome、Claude、Slack…）會拆成很多行程，從執行檔名稱看出用途。
    static func processRole(pid: Int32, executable name: String) -> String {
        if name.contains("(Renderer)") {
            return arguments(pid: pid).contains("--extension-process") ? "擴充功能" : "網頁分頁與網站"
        }
        if name.contains("(GPU)") { return "畫面繪製（GPU）" }
        if name.contains("(Plugin)") { return "外掛" }
        if name.contains("Helper") { return "背景服務（網路、儲存等）" }
        return "主程式"
    }

    /// 讀行程的啟動參數（只能讀到自己帳號的行程）。
    static func arguments(pid: Int32) -> [String] {
        var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, pid]
        var size = 0
        guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else { return [] }
        var buf = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, 3, &buf, &size, nil, 0) == 0 else { return [] }
        let argc = Int(buf.withUnsafeBytes { $0.load(as: Int32.self) })
        var i = MemoryLayout<Int32>.size
        while i < size && buf[i] != 0 { i += 1 }   // 跳過執行檔路徑
        while i < size && buf[i] == 0 { i += 1 }
        var args: [String] = []
        while args.count < argc && i < size {
            let start = i
            while i < size && buf[i] != 0 { i += 1 }
            args.append(String(decoding: buf[start..<i], as: UTF8.self))
            i += 1
        }
        return args
    }

    /// 常見的指令列程式給個看得懂的名字。
    static let knownTools: [String: String] = [
        "claude": "Claude Code（指令列）",
        "codex": "Codex（指令列）",
        "node": "Node.js",
        "python3": "Python",
        "Python": "Python",
        "java": "Java",
        "docker": "Docker",
        "qemu-system-aarch64": "虛擬機（QEMU）",
    ]

    static func displayName(forGroup key: String) -> String {
        let name = (key as NSString).lastPathComponent
        if name.hasSuffix(".app") { return String(name.dropLast(4)) }
        // Claude Code 的執行檔可能放在 .../claude/versions/1.2.3 這種路徑
        if key.contains("/claude/versions/") { return "Claude Code（指令列）" }
        return knownTools[name] ?? name
    }
}
