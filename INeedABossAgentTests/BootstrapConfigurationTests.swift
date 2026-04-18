import XCTest

final class BootstrapConfigurationTests: XCTestCase {
  func testInfoPlistConfiguresMenuBarApp() throws {
    let plist = try XCTUnwrap(NSDictionary(contentsOf: infoPlistURL) as? [String: Any])

    XCTAssertEqual(plist["CFBundlePackageType"] as? String, "APPL")
    XCTAssertEqual(plist["NSPrincipalClass"] as? String, "NSApplication")
    XCTAssertEqual(plist["LSUIElement"] as? Bool, true)
  }

  func testEntitlementsEnableSandboxAndNetworkClient() throws {
    let entitlements = try XCTUnwrap(NSDictionary(contentsOf: entitlementsURL) as? [String: Any])

    XCTAssertEqual(entitlements["com.apple.security.app-sandbox"] as? Bool, true)
    XCTAssertEqual(entitlements["com.apple.security.network.client"] as? Bool, true)
  }

  private var repositoryRootURL: URL {
    URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent()
      .deletingLastPathComponent()
  }

  private var infoPlistURL: URL {
    repositoryRootURL
      .appendingPathComponent("INeedABossAgent")
      .appendingPathComponent("App")
      .appendingPathComponent("Info.plist")
  }

  private var entitlementsURL: URL {
    repositoryRootURL
      .appendingPathComponent("INeedABossAgent")
      .appendingPathComponent("App")
      .appendingPathComponent("INeedABossAgent.entitlements")
  }
}
