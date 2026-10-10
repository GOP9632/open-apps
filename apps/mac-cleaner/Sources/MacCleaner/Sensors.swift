import Darwin
import Foundation
import IOKit
import IOKit.ps

/// 選單列那類即時資訊：網路速度、各核心 CPU、溫度、開機時間、電源、藍牙電量。
/// 全部只讀，不改任何系統設定。
enum Sensors {
    // MARK: 網路

    struct NetworkBytes {
        var received: UInt64
        var sent: UInt64
    }

    /// 所有實體網路介面（Wi‑Fi、有線、iPhone 分享）開機以來收發的位元組數，不含本機迴路。
    static func networkBytes() -> NetworkBytes? {
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return nil }
        defer { freeifaddrs(head) }
        var total = NetworkBytes(received: 0, sent: 0)
        var p: UnsafeMutablePointer<ifaddrs>? = first
        while let ifa = p {
            defer { p = ifa.pointee.ifa_next }
            guard let addr = ifa.pointee.ifa_addr, addr.pointee.sa_family == UInt8(AF_LINK),
                  let data = ifa.pointee.ifa_data else { continue }
            let name = String(cString: ifa.pointee.ifa_name)
            // VPN（utun）的流量也會走實體網卡，算進來會重複
            guard !name.hasPrefix("lo"), !name.hasPrefix("utun"), !name.hasPrefix("awdl"),
                  !name.hasPrefix("llw"), !name.hasPrefix("bridge"), !name.hasPrefix("gif"),
                  !name.hasPrefix("stf"), !name.hasPrefix("anpi") else { continue }
            let d = data.assumingMemoryBound(to: if_data.self).pointee
            total.received += UInt64(d.ifi_ibytes)
            total.sent += UInt64(d.ifi_obytes)
        }
        return total
    }

    // MARK: 各核心 CPU

    struct CoreTicks {
        var busy: UInt64
        var total: UInt64
    }

    static func perCoreTicks() -> [CoreTicks] {
        var count: natural_t = 0
        var info: processor_info_array_t?
        var infoCount: mach_msg_type_number_t = 0
        guard host_processor_info(mach_host_self(), PROCESSOR_CPU_LOAD_INFO, &count, &info, &infoCount) == KERN_SUCCESS,
              let info else { return [] }
        defer {
            vm_deallocate(mach_task_self_, vm_address_t(bitPattern: info),
                          vm_size_t(Int(infoCount) * MemoryLayout<integer_t>.stride))
        }
        let states = Int(CPU_STATE_MAX)
        return (0..<Int(count)).map { i in
            let user = UInt64(UInt32(bitPattern: info[i * states + Int(CPU_STATE_USER)]))
            let system = UInt64(UInt32(bitPattern: info[i * states + Int(CPU_STATE_SYSTEM)]))
            let idle = UInt64(UInt32(bitPattern: info[i * states + Int(CPU_STATE_IDLE)]))
            let nice = UInt64(UInt32(bitPattern: info[i * states + Int(CPU_STATE_NICE)]))
            return CoreTicks(busy: user + system + nice, total: user + system + idle + nice)
        }
    }

    /// Apple 晶片分效能核和節能核。回傳 (效能核數, 節能核數)；Intel 只有一種，節能核回 0。
    static let coreKinds: (performance: Int, efficiency: Int) = {
        func value(_ name: String) -> Int? {
            var v: Int32 = 0
            var size = MemoryLayout<Int32>.size
            return sysctlbyname(name, &v, &size, nil, 0) == 0 ? Int(v) : nil
        }
        let levels = value("hw.nperflevels") ?? 1
        let total = ProcessInfo.processInfo.processorCount
        guard levels >= 2, let p = value("hw.perflevel0.logicalcpu"), let e = value("hw.perflevel1.logicalcpu") else {
            return (total, 0)
        }
        return (p, e)
    }()

    // MARK: 開機時間

    static func bootTime() -> Date? {
        var tv = timeval()
        var size = MemoryLayout<timeval>.size
        guard sysctlbyname("kern.boottime", &tv, &size, nil, 0) == 0 else { return nil }
        return Date(timeIntervalSince1970: Double(tv.tv_sec) + Double(tv.tv_usec) / 1_000_000)
    }

    // MARK: 溫度

    /// 讀晶片裡的溫度感測器。macOS 沒有公開的 API，這裡用系統內部的 HID 感測器介面，
    /// 數值是估計值；新機型或系統更新後可能讀不到，那時回傳 nil。
    static func cpuTemperature() -> (average: Double, max: Double)? {
        let all = temperatureSensors()
        guard !all.isEmpty else { return nil }
        // Apple 晶片的 CPU 核心感測器叫 "PMU tdie…"（M2 以後）或 "pACC/eACC MTR Temp"（M1）
        var cpu = all.filter { $0.name.contains("tdie") }
        if cpu.isEmpty { cpu = all.filter { $0.name.contains("ACC MTR") } }
        if cpu.isEmpty { cpu = all.filter { $0.name.contains("CPU") } }
        let values = cpu.map(\.celsius).filter { $0 > 5 && $0 < 130 }
        guard !values.isEmpty else { return nil }
        return (values.reduce(0, +) / Double(values.count), values.max() ?? 0)
    }

    static func temperatureSensors() -> [(name: String, celsius: Double)] {
        guard let client = IOHIDEventSystemClientCreate(kCFAllocatorDefault)?.takeRetainedValue() else { return [] }
        // 0xff00 / 5 是 Apple 自訂的溫度感測器類別
        let matching = ["PrimaryUsagePage": 0xff00, "PrimaryUsage": 5] as CFDictionary
        IOHIDEventSystemClientSetMatching(client, matching)
        guard let services = IOHIDEventSystemClientCopyServices(client)?.takeRetainedValue() as? [AnyObject] else { return [] }
        var result: [(String, Double)] = []
        for service in services {
            guard let name = IOHIDServiceClientCopyProperty(service, "Product" as CFString)?.takeRetainedValue() as? String,
                  let event = IOHIDServiceClientCopyEvent(service, kTemperatureEventType, 0, 0)?.takeRetainedValue()
            else { continue }
            let value = IOHIDEventGetFloatValue(event, kTemperatureEventType << 16)
            result.append((name, value))
        }
        return result
    }

    private static let kTemperatureEventType: Int64 = 15

    // MARK: 電源

    struct Power {
        var minutesLeft: Int?        // 用電池還能撐多久；充電中則是充滿還要多久
        var isCharging: Bool
        var batteryWatts: Double?    // 正數是電池在放電給電腦用，負數是電池正在被充電
        var systemWatts: Double?     // 整台電腦現在用多少瓦（接電源時才準）
        var adapterWatts: Int?       // 充電器標示的瓦數
        var adapterName: String?
    }

    static func power(battery: [String: Any]?) -> Power {
        var p = Power(isCharging: (battery?["IsCharging"] as? Bool) ?? false)

        // 電壓（mV）× 瞬間電流（mA，負的代表在放電）
        if let b = battery, let mv = (b["Voltage"] as? NSNumber)?.doubleValue,
           let ma = (b["InstantAmperage"] as? NSNumber)?.int64Value ?? (b["Amperage"] as? NSNumber)?.int64Value {
            // 有些機型把負電流存成 32 位元無號整數
            let amps = ma > Int64(Int32.max) ? ma - (1 << 32) : ma
            p.batteryWatts = -(mv / 1000) * (Double(amps) / 1000)
        }
        if let telemetry = battery?["PowerTelemetryData"] as? [String: Any],
           let mw = (telemetry["SystemPowerIn"] as? NSNumber)?.doubleValue, mw > 0 {
            p.systemWatts = mw / 1000
        }

        if p.isCharging {
            if let m = (battery?["AvgTimeToFull"] as? NSNumber)?.intValue, m > 0, m < 65535 { p.minutesLeft = m }
        } else {
            let seconds = IOPSGetTimeRemainingEstimate()
            if seconds > 0 { p.minutesLeft = Int(seconds / 60) }
        }

        if let details = IOPSCopyExternalPowerAdapterDetails()?.takeRetainedValue() as? [String: Any] {
            p.adapterWatts = (details[kIOPSPowerAdapterWattsKey] as? NSNumber)?.intValue
            p.adapterName = details["Name"] as? String ?? details["Description"] as? String
        }
        return p
    }

    static func batteryProperties() -> [String: Any]? {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSmartBattery"))
        guard service != 0 else { return nil }
        defer { IOObjectRelease(service) }
        var props: Unmanaged<CFMutableDictionary>?
        guard IORegistryEntryCreateCFProperties(service, &props, kCFAllocatorDefault, 0) == KERN_SUCCESS else { return nil }
        return props?.takeRetainedValue() as? [String: Any]
    }

    // MARK: 藍牙裝置電量

    struct BluetoothDevice: Identifiable, Hashable {
        var id: String { name + parts.map(\.label).joined() }
        let name: String
        let kind: String            // 給圖示用：耳機、滑鼠、鍵盤、觸控板、其他
        let parts: [Part]
        struct Part: Hashable {
            let label: String       // 「左耳」「右耳」「充電盒」，單一電池則是空字串
            let percent: Int
        }
    }

    /// Apple 的滑鼠、鍵盤、觸控板直接在 IORegistry 有電量，很快。
    static func hidBatteries() -> [BluetoothDevice] {
        var iterator: io_iterator_t = 0
        guard IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("AppleDeviceManagementHIDEventService"),
                                           &iterator) == KERN_SUCCESS else { return [] }
        defer { IOObjectRelease(iterator) }
        var result: [BluetoothDevice] = []
        while case let service = IOIteratorNext(iterator), service != 0 {
            defer { IOObjectRelease(service) }
            func prop(_ key: String) -> Any? {
                IORegistryEntryCreateCFProperty(service, key as CFString, kCFAllocatorDefault, 0)?.takeRetainedValue()
            }
            guard let percent = (prop("BatteryPercent") as? NSNumber)?.intValue,
                  let name = prop("Product") as? String else { continue }
            result.append(BluetoothDevice(name: name, kind: kind(of: name), parts: [.init(label: "", percent: percent)]))
        }
        return result
    }

    /// AirPods 這類耳機只有 system_profiler 讀得到，要跑一兩秒，所以很久才更新一次。
    static func profilerBatteries() -> [BluetoothDevice] {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/sbin/system_profiler")
        task.arguments = ["SPBluetoothDataType", "-json", "-detailLevel", "basic"]
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = FileHandle.nullDevice
        guard (try? task.run()) != nil else { return [] }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let controllers = json["SPBluetoothDataType"] as? [[String: Any]] else { return [] }
        var result: [BluetoothDevice] = []
        for controller in controllers {
            // 連線中的裝置是 [{裝置名稱: {屬性}}] 這種格式
            guard let connected = controller["device_connected"] as? [[String: Any]] else { continue }
            for entry in connected {
                for (name, value) in entry {
                    guard let props = value as? [String: Any] else { continue }
                    let fields: [(String, String)] = [
                        ("device_batteryLevelLeft", "左耳"), ("device_batteryLevelRight", "右耳"),
                        ("device_batteryLevelCase", "充電盒"), ("device_batteryLevelMain", ""),
                        ("device_batteryLevel", ""),
                    ]
                    let parts = fields.compactMap { key, label -> BluetoothDevice.Part? in
                        guard let s = props[key] as? String, let v = Int(s.filter(\.isNumber)) else { return nil }
                        return .init(label: label, percent: v)
                    }
                    guard !parts.isEmpty else { continue }
                    let minor = (props["device_minorType"] as? String) ?? ""
                    result.append(BluetoothDevice(name: name, kind: kind(of: name + " " + minor), parts: parts))
                }
            }
        }
        return result
    }

    private static func kind(of text: String) -> String {
        let t = text.lowercased()
        if t.contains("airpods") || t.contains("headphone") || t.contains("beats") || t.contains("耳機") { return "耳機" }
        if t.contains("trackpad") || t.contains("觸控板") { return "觸控板" }
        if t.contains("mouse") || t.contains("滑鼠") { return "滑鼠" }
        if t.contains("keyboard") || t.contains("鍵盤") { return "鍵盤" }
        return "其他"
    }
}

// MARK: - 系統內部的 HID 感測器介面（IOKit 有匯出，但沒有標頭檔）

@_silgen_name("IOHIDEventSystemClientCreate")
private func IOHIDEventSystemClientCreate(_ allocator: CFAllocator?) -> Unmanaged<AnyObject>?

@_silgen_name("IOHIDEventSystemClientSetMatching")
@discardableResult
private func IOHIDEventSystemClientSetMatching(_ client: AnyObject, _ matching: CFDictionary) -> Int32

@_silgen_name("IOHIDEventSystemClientCopyServices")
private func IOHIDEventSystemClientCopyServices(_ client: AnyObject) -> Unmanaged<CFArray>?

@_silgen_name("IOHIDServiceClientCopyProperty")
private func IOHIDServiceClientCopyProperty(_ service: AnyObject, _ key: CFString) -> Unmanaged<AnyObject>?

@_silgen_name("IOHIDServiceClientCopyEvent")
private func IOHIDServiceClientCopyEvent(_ service: AnyObject, _ type: Int64, _ options: Int32, _ timestamp: Int64) -> Unmanaged<AnyObject>?

@_silgen_name("IOHIDEventGetFloatValue")
private func IOHIDEventGetFloatValue(_ event: AnyObject, _ field: Int64) -> Double
