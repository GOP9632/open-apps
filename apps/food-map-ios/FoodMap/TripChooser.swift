import SwiftUI

// 「加到哪個行程？」：還沒過期的行程不只一個（或進行中的那個已經過期、或還沒有行程）時，按「加進行程」先問加到哪
extension View {
    func tripChooser() -> some View { modifier(TripChooserHost()) }
}

private struct TripChooserHost: ViewModifier {
    @Environment(Store.self) private var store
    @State private var trips = TripStore.shared

    func body(content: Content) -> some View {
        content.sheet(item: Binding(get: { trips.choosing }, set: { trips.choosing = $0 })) { p in
            TripChooser(place: p)
                .environment(store)
                .presentationDetents([.medium])
                .presentationBackground(Color.bg)
                .presentationCornerRadius(28)
        }
    }
}

private struct TripChooser: View {
    let place: Place
    @Environment(Store.self) private var store
    @State private var trips = TripStore.shared

    var body: some View {
        let list = trips.upcoming
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("加到哪個行程？").font(.system(size: 24, weight: .black)).foregroundStyle(Color.ink)
                    Text(place.name).font(.subheadline.weight(.semibold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                }
                .padding(.bottom, 4)
                ForEach(list) { t in row(t) }
                Button {
                    trips.addToNew(place, store: store)
                } label: {
                    Label("開新行程", systemImage: "plus").frame(maxWidth: .infinity)
                }
                .buttonStyle(ChunkyStyle(radius: 18))
                .padding(.top, 4)
            }
            .padding(.horizontal, 18).padding(.top, 22).padding(.bottom, 20)
        }
    }

    private func row(_ t: Trip) -> some View {
        let today = TripDate.today
        let now = t.start.map { $0 <= today && (t.end ?? $0) >= today } ?? false
        let n = trips.stops(t.id).count
        var meta: [String] = []
        if now { meta.append("今天") }
        if let st = t.start {
            meta.append(t.days > 1 ? "\(TripDate.label(st))–\(TripDate.short(t.end ?? st))" : TripDate.label(st))
        } else {
            meta.append("沒排日期")
        }
        meta.append(n == 0 ? "還沒有站" : "\(n) 站")
        if t.days > 1 { meta.append("會加到第 \(trips.pickDay(t, place: place)) 天") }
        return Button {
            trips.add(place, to: t, made: false, store: store)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath.fill")
                    .font(.system(size: 17, weight: .bold)).foregroundStyle(now ? .white : Color.accentDeep)
                    .frame(width: 44, height: 44)
                    .background(now ? Color.accent : Color.accent.opacity(0.13), in: .rect(cornerRadius: 14))
                VStack(alignment: .leading, spacing: 3) {
                    Text(t.title).font(.system(size: 17, weight: .heavy)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(meta.joined(separator: "・")).font(.caption.weight(.bold)).foregroundStyle(Color.ink.opacity(0.5)).lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "plus.circle.fill").font(.system(size: 24)).foregroundStyle(Color.accent)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .candy(20)
            .contentShape(.rect)
        }
        .buttonStyle(PressStyle(haptic: true))
    }
}
