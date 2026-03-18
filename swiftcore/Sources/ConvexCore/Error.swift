import Foundation

#if SKIP
public let convexBaseURL = "http://10.0.2.2:3210"
public let convexSiteURL = "http://10.0.2.2:3211"
#else
public let convexBaseURL = "http://127.0.0.1:3210"
public let convexSiteURL = "http://127.0.0.1:3211"
#endif
public enum ConvexError: Error {
    case decodingError(String)
    case notInitialized
    case serverError(String)
}
