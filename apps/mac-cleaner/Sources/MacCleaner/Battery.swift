import Foundation
import IOKit

/// 從 IOKit 的 AppleSmartBattery 讀電池資訊。桌機沒有電池會回傳 nil。
struct BatteryInfo {
    var health: Double?        // 目前最大容量 ÷ 出廠設計容量，百分比
    var maxCapacity: Int?      // mAh
    var designCapacity: Int?   // mAh
    var cycleCount: Int?
    var designCycleCount: Int?
    var charge: Int?           // 目前電量 %
    var isCharging: Bool
    var isPluggedIn: Bool
    var temperature: Double?   // 攝氏

    static func read() -> BatteryInfo? {
        let service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSmartBattery"))
        guard service != 0 else { return nil }
        defer { IOObjectRelease(service) }

        var props: Unmanaged<CFMutableDictionary>?
        guard IORegistryEntryCreateCFProperties(service, &props, kCFAllocatorDefault, 0) == KERN_SUCCESS,
              let dict = props?.takeRetainedValue() as? [String: Any] else { return nil }

        func int(_ key: String) -> Int? { (dict[key] as? NSNumber)?.intValue }

        // Apple Silicon 上 MaxCapacity 是百分比，真正的 mAh 在 AppleRawMaxCapacity
        let design = int("DesignCapacity")
        var maxCap = int("AppleRawMaxCapacity") ?? int("NominalChargeCapacity")
        if maxCap == nil, let m = int("MaxCapacity"), m > 100 { maxCap = m }
        var health: Double?
        if let d = design, d > 0, let m = maxCap {
            health = min(Double(m) / Double(d) * 100, 100)
        }

        var charge = int("CurrentCapacity")
        if let c = charge, c > 100, let m = int("MaxCapacity"), m > 0 {
            charge = c * 100 / m
        }

        return BatteryInfo(
            health: health,
            maxCapacity: maxCap,
            designCapacity: design,
            cycleCount: int("CycleCount"),
            designCycleCount: int("DesignCycleCount9C"),
            charge: charge,
            isCharging: (dict["IsCharging"] as? Bool) ?? false,
            isPluggedIn: (dict["ExternalConnected"] as? Bool) ?? false,
            temperature: int("Temperature").map { Double($0) / 100 }
        )
    }
}
