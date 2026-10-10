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
        let internal = UInt64(stats.internal_page_count)
        let purgeable = UInt64(stats.purgeable_count)
        return Memory(
            total: ProcessInfo.processInfo.physicalMemory,
            app: (internal > purgeable ? internal - purgeable : 0) * page,
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
            result[key] = s
        }
        return result
    }

    static func displayName(forGroup key: String) -> String {
        let name = (key as NSString).lastPathComponent
        return name.hasSuffix(".app") ? String(name.dropLast(4)) : name
    }
}
