import Foundation

public func formatTimestamp(
    _ timestamp: Double,
    dateStyle: DateFormatter.Style = .medium,
    timeStyle: DateFormatter.Style = .none
) -> String {
    let date = Date(timeIntervalSince1970: timestamp / 1_000)
    let formatter = DateFormatter()
    formatter.dateStyle = dateStyle
    formatter.timeStyle = timeStyle
    return formatter.string(from: date)
}
