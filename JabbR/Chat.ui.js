﻿﻿/// <reference path="Scripts/jquery-1.7.js" />
/// <reference path="Scripts/jQuery.tmpl.js" />
/// <reference path="Scripts/jquery.cookie.js" />

(function ($, window, utility) {
    "use strict";

    var $chatArea = null,
        $tabs = null,
        $submitButton = null,
        $newMessage = null,
        $enableDisableToast = null,
        templates = null,
        app = null,
        focus = true,
        commands = [],
        Keys = { Up: 38, Down: 40, Esc: 27 },
        scrollTopThreshold = 5,
        toastEnabled = false,
        chromeToast = null;

    function getRoomId(roomName) {
        return escape(roomName.toLowerCase()).replace(/[^a-z0-9]/, '_');
    }

    function getUserClassName(userName) {
        return '[data-name="' + userName + '"]';
    }

    function Room($tab, $users, $messages) {
        this.tab = $tab;
        this.users = $users;
        this.messages = $messages;

        this.isLobby = function () {
            return this.tab.hasClass('lobby');
        };

        this.hasUnread = function () {
            return this.tab.hasClass('unread');
        };

        this.getUnread = function () {
            return $tab.data('unread') || 0;
        };

        this.hasSeparator = function () {
            return this.messages.find('.message-separator').length > 0;
        };

        this.needsSeparator = function () {
            if (this.isActive()) {
                return false;
            }
            return this.isInitialized() && this.getUnread() === 5;
        };

        this.addSeparator = function () {
            if (this.isLobby()) {
                return;
            }

            // find first correct unread message
            var n = this.getUnread(),
                $unread = this.messages.find('.message').eq(-(n + 1));

            $unread.after(templates.separator.tmpl())
                .data('unread', n); // store unread count

            this.scrollToBottom();
        };

        this.removeSeparator = function () {
            this.messages.find('.message-separator').fadeOut(2000, function () {
                $(this).remove();
            });
        };

        this.updateUnread = function (isMentioned) {
            var $tab = this.tab.addClass('unread'),
                $content = $tab.find('.content'),
                unread = ($tab.data('unread') || 0) + 1,
                hasMentions = $tab.data('hasMentions') || isMentioned; // Whether or not the user already has unread messages to him/her

            $content.text((hasMentions ? '*' : '') + '(' + unread + ') ' + this.getName());

            $tab.data('unread', unread);
            $tab.data('hasMentions', hasMentions);
        };

        this.scrollToBottom = function () {
            this.messages.scrollTop(this.messages[0].scrollHeight);
        };

        this.isNearTheEnd = function () {
            return this.messages.isNearTheEnd();
        };

        this.getName = function () {
            return this.tab.data('name');
        };

        this.isActive = function () {
            return this.tab.hasClass('current');
        };

        this.exists = function () {
            return this.tab.length > 0;
        };

        this.clear = function () {
            this.messages.empty();
            this.users.empty();
        };

        this.makeInactive = function () {
            this.tab.removeClass('current');

            this.messages.removeClass('current')
                         .hide();

            this.users.removeClass('current')
                      .hide();
        };

        this.makeActive = function () {
            var currUnread = this.getUnread(),
                lastUnread = this.messages.find('.message-separator').data('unread') || 0;

            this.tab.addClass('current')
                    .removeClass('unread')
                    .data('unread', 0)
                    .data('hasMentions', false)
                    .find('.content')
                    .text(this.getName());

            this.messages.addClass('current')
                         .show();

            this.users.addClass('current')
                      .show();

            // if no unread since last separator
            // remove previous separator
            if (currUnread <= lastUnread) {
                this.removeSeparator();
            }
        };

        this.setInitialized = function () {
            this.tab.data('initialized', true);
        };

        this.isInitialized = function () {
            return this.tab.data('initialized') === true;
        };

        // Users
        this.getUser = function (userName) {
            return this.users.find(getUserClassName(userName));
        };

        this.getUserReferences = function (userName) {
            return $.merge(this.getUser(userName),
                           this.messages.find(getUserClassName(userName)));
        };

        this.setLocked = function () {
            this.tab.addClass('locked');
        };
    }

    function getRoomElements(roomName) {
        var roomId = getRoomId(roomName);
        return new Room($('#tabs-' + roomId),
                        $('#users-' + roomId),
                        $('#messages-' + roomId));
    }

    function getCurrentRoomElements() {
        return new Room($tabs.find('li.current'),
                        $('.users.current'),
                        $('.messages.current'));
    }

    function getLobby() {
        return getRoomElements('Lobby');
    }

    function updateLobbyRoomCount(room, count) {
        var lobby = getLobby(),
            $room = lobby.users.find('[data-room="' + room.Name + '"]'),
            $count = $room.find('.count');

        $room.css('background-color', '#f5f5f5');
        $count.text(' (' + count + ')');

        if (room.Private === true) {
            $room.addClass('locked');
        }

        // Do a little animation
        $room.animate({ backgroundColor: '#e5e5e5' }, 800);
    }


    function addRoom(roomName) {
        // Do nothing if the room exists
        var room = getRoomElements(roomName),
            roomId = null,
            viewModel = null,
            $messages = null,
            scrollHandler = null;

        if (room.exists()) {
            return false;
        }

        roomId = getRoomId(roomName);

        // Add the tab
        viewModel = {
            id: roomId,
            name: roomName
        };

        templates.tab.tmpl(viewModel).appendTo($tabs);

        $messages = $('<ul/>').attr('id', 'messages-' + roomId)
                              .addClass('messages')
                              .appendTo($chatArea)
                              .hide();


        $('<ul/>').attr('id', 'users-' + roomId)
                  .addClass('users')
                  .appendTo($chatArea).hide();

        $tabs.find('li')
            .not('.lobby')
            .sortElements(function (a, b) {
                return $(a).data('name').toLowerCase() > $(b).data('name').toLowerCase() ? 1 : -1;
            });

        scrollHandler = function (ev) {
            var messageId = null;

            // Do nothing if there's nothing else
            if ($(this).data('full') === true) {
                return;
            }

            // If you're we're near the top, raise the event
            if ($(this).scrollTop() <= scrollTopThreshold) {
                var $child = $messages.children('.message:first');
                if ($child.length > 0) {
                    messageId = $child.attr('id')
                                      .substr(2); // Remove the "m-"
                    $(ui).trigger('ui.scrollRoomTop', [{ name: roomName, messageId: messageId}]);
                }
            }
        };

        // Hookup the scroll handler since event delegation doesn't work with scroll events
        $messages.bind('scroll', scrollHandler);

        // Store the scroll handler so we can remove it later
        $messages.data('scrollHandler', scrollHandler);

        setAccessKeys();
        return true;
    }

    function removeRoom(roomName) {
        var room = getRoomElements(roomName),
            scrollHandler = null;

        if (room.exists()) {
            // Remove the scroll handler from this room
            scrollHandler = room.messages.data('scrollHandler');
            room.messages.unbind('scrollHandler', scrollHandler);

            room.tab.remove();
            room.messages.remove();
            room.users.remove();
            setAccessKeys();
        }
    }

    function setAccessKeys() {
        $.each($tabs.find('li.room'), function (index, item) {
            $(item).children('button:first-child').attr('accesskey', getRoomAccessKey(index));
        });
    }

    function getRoomAccessKey(index) {
        if (index < 10) {
            return index + 1;
        }
        return 0;
    }

    function navigateToRoom(roomName) {
        app.runRoute('get', '#/rooms/' + roomName, {
            room: roomName
        });
    }

    function processMessage(message) {
        message.trimmedName = utility.trim(message.name, 21);
        message.when = message.date.formatTime(true);
        message.fulldate = message.date.toLocaleString()
    }

    function toastMessage(message) {
        // when we are not focused, attempt chrome popup notifications (toast)
        if (!ui.focus) {
            if (window.webkitNotifications && window.webkitNotifications.checkPermission() === 0) {
                // replace any previous toast
                if (chromeToast && chromeToast.cancel) {
                    chromeToast.cancel();
                }
                chromeToast = window.webkitNotifications.createNotification(
                        "Content/images/logo32.png",
                        message.trimmedName,
                        message.message);

                chromeToast.ondisplay = function () {
                    setTimeout(function() { chromeToast.cancel(); }, 10000);
                };
                
                chromeToast.onclick = function() {
                    window.focus(); // this will cause that toast to be hidden in triggerFocus
                };

                chromeToast.show();
            }
        }
    }

    function hideToast() {
        if (chromeToast && chromeToast.cancel) {
            chromeToast.cancel();
        }
    }
    
    function toggleEnableToast() {
        if (window.webkitNotifications) {
            if (!toastEnabled) {
                window.webkitNotifications.requestPermission(function() {
                    $enableDisableToast.html('Disable notifications');
                    toastEnabled = true;
                });
            }
            else {
                $enableDisableToast.html('Enable notifications');
                toastEnabled = false;
            }
        }
    }

    function triggerFocus() {
        ui.focus = true;
        hideToast();
        $(ui).trigger('ui.focus');
    }

    var ui = {
        initialize: function () {
            $chatArea = $('#chat-area');
            $tabs = $('#tabs');
            $submitButton = $('#send-message');
            $newMessage = $('#new-message');
            $enableDisableToast = $('#enable-disable-toast');
            focus = true;
            templates = {
                user: $('#new-user-template'),
                message: $('#new-message-template'),
                notification: $('#new-notification-template'),
                separator: $('#message-separator-template'),
                tab: $('#new-tab-template')
            },
            app = Sammy(function () {
                // Process this route
                this.get('#/rooms/:room', function () {
                    var roomName = this.params.room;

                    if (ui.setActiveRoom(roomName) === false) {
                        $(ui).trigger('ui.openRoom', [roomName]);
                    }
                });
            });

            // TODO: persist and restore previous toast enabled setting
            if (window.webkitNotifications) {
                if (window.webkitNotifications.checkPermission() === 0) {
                    $enableDisableToast.html('Disable notifications');
                    toastEnabled = true;
                }
            }
            
            // DOM events
            $(document).on('click', 'h3.collapsible_title', function () {
                var $message = $(this).closest('.message'),
                    nearEnd = ui.isNearTheEnd();

                $(this).next().toggle(0, function () {
                    if (nearEnd) {
                        ui.scrollToBottom();
                    }
                });
            });

            $(document).on('click', '#tabs li', function () {
                ui.setActiveRoom($(this).data('name'))
            });

            $(document).on('click', 'li.room', function () {
                var roomName = $(this).data('name');

                navigateToRoom(roomName);

                return false;
            });

            $(document).on('click', '#tabs li .close', function (ev) {
                var roomName = $(this).closest('li').data('name');

                $(ui).trigger('ui.closeRoom', [roomName]);

                ev.preventDefault();
                return false;
            });

            // handle click on notifications
            $(document).on('click', '.notification a.info', function (ev) {
                var $notification = $(this).closest('.notification');

                if ($(this).hasClass('collapse')) {
                    ui.collapseNotifications($notification);
                }
                else {
                    ui.expandNotifications($notification);
                }
            });

            $submitButton.submit(function (ev) {
                var msg = $.trim($newMessage.val());

                if (msg) {
                    $(ui).trigger('ui.sendMessage', [msg]);
                }

                $newMessage.val('');
                $newMessage.focus();

                triggerFocus();

                // always scroll to bottom after new message sent
                var room = getCurrentRoomElements();
                room.scrollToBottom();
                room.removeSeparator();

                ev.preventDefault();
                return false;
            });

            $enableDisableToast.click(function () {
                toggleEnableToast();
            });

            $(window).blur(function () {
                ui.focus = false;
                $(ui).trigger('ui.blur');
            });

            $(window).focus(function () {
                // clear unread count in active room
                var room = getCurrentRoomElements();
                room.makeActive();
                triggerFocus();
            });

            $newMessage.keydown(function (e) {
                var key = e.keyCode || e.which;
                switch (key) {
                    case Keys.Up:
                        $(ui).trigger('ui.prevMessage');
                        break;

                    case Keys.Down:
                        $(ui).trigger('ui.nextMessage');
                        break;

                    case Keys.Esc:
                        $(this).val('');
                        break;
                }
            });

            // Auto-complete for user names
            $newMessage.autoTabComplete({
                prefixMatch: '[@#/]',
                get: function (prefix) {
                    switch (prefix) {
                        case '@':
                            var room = getCurrentRoomElements();
                            return room.users.find('li')
                                         .not('.room')
                                         .map(function () { return $(this).data('name'); });
                        case '#':
                            var lobby = getLobby();
                            return lobby.users.find('li')
                                         .map(function () { return $(this).data('name'); });

                        case '/':
                            var commands = ui.getCommands();
                            return ui.getCommands()
                                         .map(function (cmd) { return cmd.Name; });
                        default:
                            return [];
                    }
                }
            });

            $newMessage.keypress(function (e) {
                $(ui).trigger('ui.typing');
            });

            $newMessage.focus();
        },
        run: function () {
            app.run();
        },
        setMessage: function (value) {
            $newMessage.val(value);
            $newMessage.selectionEnd = value.length;
        },
        addRoom: addRoom,
        removeRoom: removeRoom,
        setRoomOwner: function (ownerName, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(ownerName);

            $user.find('.owner')
                 .text('(owner)');
        },
        clearRoomOwner: function (ownerName, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(ownerName);

            $user.find('.owner')
                 .text('');
        },
        setActiveRoom: function (roomName) {
            var room = getRoomElements(roomName);

            if (room.isActive()) {
                // Still trigger the event (just do less overall work)
                $(ui).trigger('ui.activeRoomChanged', [roomName]);
                return true;
            }

            var currentRoom = getCurrentRoomElements();

            if (room.exists() && currentRoom.exists()) {
                var hasUnread = room.hasUnread();
                currentRoom.makeInactive();
                triggerFocus();
                room.makeActive();

                app.setLocation('#/rooms/' + roomName);
                $(ui).trigger('ui.activeRoomChanged', [roomName]);
                return true;
            }

            return false;
        },
        setRoomLocked: function (roomName) {
            var room = getRoomElements(roomName);

            room.setLocked();
        },
        updateLobbyRoomCount: updateLobbyRoomCount,
        updateUnread: function (roomName, isMentioned) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();

            if (ui.hasFocus() && room.isActive()) {
                return;
            }

            room.updateUnread(isMentioned);
        },
        scrollToBottom: function (roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();

            if (room.isActive()) {
                room.scrollToBottom();
            }
        },
        isNearTheEnd: function (roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();

            return room.isNearTheEnd();
        },
        populateLobbyRooms: function (rooms) {
            var lobby = getLobby(),
            // sort lobby by room count descending
                sorted = rooms.sort(function (a, b) {
                    return a.Count > b.Count ? -1 : 1;
                });

            lobby.users.empty();

            $.each(sorted, function () {
                var $name = $('<span/>').addClass('name')
                                        .html(this.Name),
                    $count = $('<span/>').addClass('count')
                                         .html(' (' + this.Count + ')')
                                         .data('count', this.Count),
                    $locked = $('<span/>').addClass('lock'),
                    $li = $('<li/>').addClass('room')
                          .attr('data-room', this.Name)
                          .data('name', this.Name)
                          .append($locked)
                          .append($name)
                          .append($count)
                          .appendTo(lobby.users);

                if (this.Private) {
                    $li.addClass('locked');
                }
            });
        },
        addUser: function (user, roomName) {
            var room = getRoomElements(roomName),
                $user = null;

            // Remove all users that are being removed
            room.users.find('.removing').remove();

            // Get the user element
            $user = room.getUser(user.name);

            if ($user.length) {
                return false;
            }

            templates.user.tmpl(user).appendTo(room.users);

            return true;
        },
        setUserActivity: function (user) {
            var $user = $('.users').find(getUserClassName(user.Name));

            if (user.Active === true) {
                $user.fadeTo('slow', 1, function () {
                    $user.removeClass('idle');
                });
            }
            else {
                $user.fadeTo('slow', 0.5, function () {
                    $user.addClass('idle');
                });
            }
        },
        changeUserName: function (oldName, user, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUserReferences(oldName);

            // Update the user's name
            $user.find('.name').html(user.Name);
            $user.attr('data-name', user.Name);
        },
        changeGravatar: function (user, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUserReferences(user.Name),
                src = 'http://www.gravatar.com/avatar/' + user.Hash + '?s=16&d=mm';

            $user.find('.gravatar')
                 .attr('src', src);
        },
        removeUser: function (user, roomName) {
            var room = getRoomElements(roomName),
                $user = room.getUser(user.Name);

            $user.addClass('removing')
                .fadeOut('slow', function () {
                    $(this).remove();
                });
        },
        setUserTyping: function (user, roomName, isTyping) {
            var room = getRoomElements(roomName),
                $user = room.getUser(user.Name);

            if (isTyping) {
                $user.addClass('typing');
            }
            else {
                $user.removeClass('typing');
            }
        },
        prependChatMessages: function (messages, roomName) {
            var room = getRoomElements(roomName),
                $messages = room.messages,
                $target = $messages.children().first(),
                $previousMessage = null,
                $current = null,
                previousUser = null;

            if (messages.length === 0) {
                // Mark this list as full
                $messages.data('full', true);
                return;
            }

            // Populate the old messages
            $.each(messages, function (index) {
                processMessage(this);

                if ($previousMessage) {
                    previousUser = $previousMessage.data('name');
                }

                // Determine if we need to show the user
                this.showUser = !previousUser || previousUser !== this.name;

                // Render the new message
                $target.before(templates.message.tmpl(this));

                if (this.showUser === false) {
                    $previousMessage.addClass('continue');
                }

                $previousMessage = $('#m-' + this.id);
            });

            // Scroll to the bottom element so the user sees there's more messages
            $target[0].scrollIntoView();
        },
        addChatMessage: function (message, roomName) {
            var room = getRoomElements(roomName),
                $previousMessage = room.messages.children().last(),
                previousUser = null,
                previousTimestamp = new Date(),
                showUserName = true,
                $message = null;

            if ($previousMessage.length > 0) {
                previousUser = $previousMessage.data('name');
                previousTimestamp = new Date($previousMessage.data('timestamp') || new Date());
            }

            // Determine if we need to show the user name next to the message
            showUserName = previousUser !== message.name;
            message.showUser = showUserName;

            processMessage(message);

            if (showUserName === false) {
                $previousMessage.addClass('continue');
            }

            // check to see if room needs a separator
            if (room.needsSeparator()) {
                // if there's an existing separator, remove it
                if (room.hasSeparator()) {
                    room.removeSeparator();
                }
                room.addSeparator();
            }

            if (message.date.toDate().diffDays(previousTimestamp.toDate())) {
                ui.addMessage(message.date.toLocaleDateString(), 'list-header', roomName)
                  .find('.right').remove(); // remove timestamp on date indicator
            }

            if (toastEnabled) {
                toastMessage(message);
            }

            templates.message.tmpl(message).appendTo(room.messages);
        },
        addChatMessageContent: function (id, content, roomName) {
            var $message = $('#m-' + id);

            $message.find('.middle')
                    .append(content);
        },
        addMessage: function (content, type, roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements(),
                nearEnd = room.isNearTheEnd(),
                $element = null,
                now = new Date(),
                message = {
                    message: content,
                    type: type,
                    date: now,
                    when: now.formatTime(true),
                    fulldate: now.toLocaleString()
                };

            $element = templates.notification.tmpl(message).appendTo(room.messages);

            if (type === 'notification' && room.isLobby() === false) {
                ui.collapseNotifications($element);
            }

            if (nearEnd) {
                ui.scrollToBottom(roomName);
            }

            return $element;
        },
        hasFocus: function () {
            return ui.focus;
        },
        getCommands: function () {
            return ui.commands;
        },
        setCommands: function (commands) {
            ui.commands = commands;
        },
        setInitialized: function (roomName) {
            var room = roomName ? getRoomElements(roomName) : getCurrentRoomElements();
            room.setInitialized();
        },
        collapseNotifications: function ($notification) {
            // collapse multiple notifications
            var $notifications = $notification.prevUntil(':not(.notification)');
            if ($notifications.length > 3) {
                $notifications
                    .hide()
                    .find('.info').text('');    // clear any prior text
                $notification.find('.info')
                    .text(' (plus ' + $notifications.length + ' hidden... click to expand)')
                    .removeClass('collapse');
            }
        },
        expandNotifications: function ($notification) {
            // expand collapsed notifications
            var $notifications = $notification.prevUntil(':not(.notification)'),
                topBefore = $notification.position().top;

            $notification.find('.info')
                .text(' (click to collapse)')
                .addClass('collapse');
            $notifications.show();

            var room = getCurrentRoomElements(),
                topAfter = $notification.position().top,
                scrollTop = room.messages.scrollTop();

            // make sure last notification is visible
            room.messages.scrollTop(scrollTop + topAfter - topBefore + $notification.height());
        }
    };

    if (!window.chat) {
        window.chat = {};
    }
    window.chat.ui = ui;
})(jQuery, window, window.chat.utility);
