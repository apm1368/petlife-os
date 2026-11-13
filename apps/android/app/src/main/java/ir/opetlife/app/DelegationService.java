package ir.opetlife.app;

/**
 * Lets Chrome show opetlife.ir's web push notifications as this app's notifications (notification delegation),
 * including the Android 13+ permission prompt. No extra command handlers are needed.
 */
public class DelegationService extends com.google.androidbrowserhelper.trusted.DelegationService {
}
